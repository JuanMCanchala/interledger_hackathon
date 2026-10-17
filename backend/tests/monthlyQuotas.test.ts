import { describe, expect, it } from "vitest";
import { cop, setupMiPlante } from "./miplanteHarness.js";

/** Sells `amount` COP and has the customer pay the sale's payment request. */
async function sellAndPay(env: ReturnType<typeof setupMiPlante>, merchantId: string, amount: string) {
  const { sale } = await env.sales.createSale(merchantId, { amount });
  const request = (await env.store.getPayment((await env.store.getSale(sale.id))!.paymentId!))!;
  env.deliver(request.incomingPaymentUrl, cop(`${amount}00`));
  return env.sales.refresh(sale.id);
}

describe("monthly quotas", () => {
  it("pays the supplier until its monthly quota is covered, then the rest is profit", async () => {
    const env = setupMiPlante();
    // The microcredit is due 2,000 COP a month; it takes 15% of each sale until then.
    const merchantId = await env.onboardRosa({
      rules: [
        {
          label: "Microcrédito",
          category: "Microcréditos",
          kind: "debt",
          destination: "$ilp.interledger-test.dev/coop",
          sharePercent: 15,
          monthlyQuota: "2000",
        },
      ],
    });

    const first = await sellAndPay(env, merchantId, "10000");
    const second = await sellAndPay(env, merchantId, "10000");
    const third = await sellAndPay(env, merchantId, "10000");

    expect(first.settlement.kept).toEqual(cop("850000")); // 1,500 to the microcredit
    expect(second.settlement.kept).toEqual(cop("950000")); // only the 500 left of the quota
    expect(third.settlement.kept).toEqual(cop("1000000")); // quota paid: all profit
    expect(third.settlement.items).toEqual([]);

    // The dashboard shows the quota paid for the month.
    const dashboard = await env.dashboard.get(merchantId);
    expect(dashboard.rules[0]!.paidThisMonth).toEqual(cop("200000"));

    // And the month so far: three paid sales today, the 16th of a 31-day October.
    expect(dashboard.month).toMatchObject({
      dayOfMonth: 16,
      daysInMonth: 31,
      salesCount: 3,
      gross: cop("3000000"),
      allocated: cop("200000"),
      kept: cop("2800000"),
    });
    expect(dashboard.month.days).toHaveLength(16);
    expect(dashboard.month.days.at(-1)).toEqual({
      date: "2026-10-16",
      salesCount: 3,
      gross: cop("3000000"),
      allocated: cop("200000"),
    });
    expect(dashboard.month.days[0]!.date).toBe("2026-10-01");
  });

  it("starts each calendar month with the whole quota again", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa({
      rules: [
        {
          label: "Microcrédito",
          category: "Microcréditos",
          kind: "debt",
          destination: "$ilp.interledger-test.dev/coop",
          sharePercent: 15,
          monthlyQuota: "1500",
        },
      ],
    });
    await sellAndPay(env, merchantId, "10000"); // October's quota: paid

    env.clock.now = new Date("2026-11-02T15:00:00Z");
    const november = await sellAndPay(env, merchantId, "10000");

    expect(november.settlement.kept).toEqual(cop("850000"));
  });
});
