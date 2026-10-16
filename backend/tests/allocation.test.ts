import { describe, expect, it } from "vitest";
import {
  percentToBps,
  planAllocations,
  validateRules,
  type AllocationRule,
} from "../src/domain/allocation.js";
import {
  bogotaDay,
  lastBogotaDays,
  startOfBogotaDay,
} from "../src/domain/calendar.js";

const COP = { assetCode: "COP", assetScale: 2 };
const cop = (value: string) => ({ value, ...COP });

const microcredit: AllocationRule = {
  id: "loan",
  label: "Microcrédito",
  kind: "debt",
  destination: "https://ilp.interledger-test.dev/coop",
  shareBps: 1500,
  outstanding: cop("30000000"),
};
const savings: AllocationRule = {
  id: "savings",
  label: "Fondo de emergencia",
  kind: "savings",
  destination: "https://ilp.interledger-test.dev/ahorro",
  shareBps: 500,
};

describe("planAllocations", () => {
  it("splits a 10,000 COP sale into 1,500 + 500 and the merchant keeps 8,000", () => {
    const plan = planAllocations(cop("1000000"), [microcredit, savings]);

    expect(plan.allocations).toEqual([
      { ruleId: "loan", amount: cop("150000"), capped: false },
      { ruleId: "savings", amount: cop("50000"), capped: false },
    ]);
    expect(plan.allocated).toEqual(cop("200000"));
    expect(plan.kept).toEqual(cop("800000"));
  });

  it("rounds every allocation down and leaves the remainder to the merchant", () => {
    // 15% of 333 = 49.95 → 49; 5% of 333 = 16.65 → 16
    const plan = planAllocations(cop("333"), [microcredit, savings]);

    expect(plan.allocations.map((a) => a.amount.value)).toEqual(["49", "16"]);
    expect(plan.kept).toEqual(cop("268"));
  });

  it("never takes more than the outstanding debt", () => {
    const plan = planAllocations(cop("1000000"), [
      { ...microcredit, outstanding: cop("40000") },
      savings,
    ]);

    expect(plan.allocations[0]).toEqual({
      ruleId: "loan",
      amount: cop("40000"),
      capped: false,
    });
  });

  it("skips debts that are already paid and allocations that round to zero", () => {
    expect(
      planAllocations(cop("1000000"), [
        { ...microcredit, outstanding: cop("0") },
        savings,
      ]).allocations.map((a) => a.ruleId),
    ).toEqual(["savings"]);
    expect(
      planAllocations(cop("5"), [microcredit, savings]).allocations,
    ).toEqual([]);
  });

  it("fits allocations into what is left of the daily cap, in rule order", () => {
    const plan = planAllocations(
      cop("1000000"),
      [microcredit, savings],
      cop("170000"),
    );

    expect(plan.allocations).toEqual([
      { ruleId: "loan", amount: cop("150000"), capped: false },
      { ruleId: "savings", amount: cop("20000"), capped: true },
    ]);
    expect(plan.kept).toEqual(cop("830000"));
  });

  it("collects nothing once the daily cap is exhausted", () => {
    const plan = planAllocations(
      cop("1000000"),
      [microcredit, savings],
      cop("0"),
    );

    expect(plan.allocations).toEqual([
      { ruleId: "loan", amount: cop("0"), capped: true },
      { ruleId: "savings", amount: cop("0"), capped: true },
    ]);
    expect(plan.kept).toEqual(cop("1000000"));
  });

  it("refuses to mix assets", () => {
    expect(() =>
      planAllocations({ value: "100", assetCode: "USD", assetScale: 2 }, [
        microcredit,
      ]),
    ).toThrow();
  });
});

describe("validateRules", () => {
  it("accepts rules that take up to 50% of a sale", () => {
    expect(() =>
      validateRules([microcredit, { ...savings, shareBps: 3500 }], COP),
    ).not.toThrow();
  });

  it("keeps the majority of every sale for the merchant", () => {
    expect(() =>
      validateRules([microcredit, { ...savings, shareBps: 3501 }], COP),
    ).toThrow("50%");
  });

  it("requires a positive outstanding balance in the merchant's asset for debts", () => {
    expect(() =>
      validateRules([{ ...microcredit, outstanding: undefined }], COP),
    ).toThrow();
    expect(() =>
      validateRules([{ ...microcredit, outstanding: cop("0") }], COP),
    ).toThrow();
    expect(() =>
      validateRules(
        [
          {
            ...microcredit,
            outstanding: { value: "100", assetCode: "USD", assetScale: 2 },
          },
        ],
        COP,
      ),
    ).toThrow();
  });

  it("accepts only whole, positive basis points", () => {
    expect(() => validateRules([{ ...savings, shareBps: 0 }], COP)).toThrow();
    expect(() =>
      validateRules([{ ...savings, shareBps: 12.5 }], COP),
    ).toThrow();
  });

  it("requires between one and five rules", () => {
    expect(() => validateRules([], COP)).toThrow();
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...savings,
      id: `s${i}`,
      shareBps: 100,
    }));
    expect(() => validateRules(many, COP)).toThrow();
  });
});

describe("percentToBps", () => {
  it("converts percentages with up to two decimals", () => {
    expect(percentToBps(15)).toBe(1500);
    expect(percentToBps(0.01)).toBe(1);
    expect(percentToBps(12.34)).toBe(1234);
  });

  it("rejects more precision than a basis point", () => {
    expect(() => percentToBps(12.345)).toThrow();
  });
});

describe("Bogotá calendar (UTC−5, no daylight saving time)", () => {
  it("starts the day at 05:00 UTC", () => {
    expect(
      startOfBogotaDay(new Date("2026-10-17T03:00:00Z")).toISOString(),
    ).toBe("2026-10-16T05:00:00.000Z");
    expect(
      startOfBogotaDay(new Date("2026-10-16T05:00:00Z")).toISOString(),
    ).toBe("2026-10-16T05:00:00.000Z");
  });

  it("labels dates and lists the last days oldest first", () => {
    expect(bogotaDay(new Date("2026-10-17T03:00:00Z"))).toBe("2026-10-16");
    expect(lastBogotaDays(new Date("2026-10-16T15:00:00Z"), 3)).toEqual([
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
  });
});
