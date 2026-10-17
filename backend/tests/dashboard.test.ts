import { describe, expect, it } from "vitest";
import { DashboardService } from "../src/merchants/dashboardService.js";
import { ALICE } from "./fakeOperations.js";
import { cop, setupMiPlante } from "./miplanteHarness.js";

function setup() {
  const env = setupMiPlante();
  const dashboard = new DashboardService(
    env.flows,
    env.merchants,
    env.sales,
    env.store,
    {
      now: env.now,
    },
  );
  /** A 10,000 COP sale, paid and settled. */
  const sell = async (merchantId: string) => {
    const { sale } = await env.sales.createSale(merchantId, { amount: "10000" });
    await env.sales.pay(sale.id, { customerWallet: ALICE });
    const paymentId = (await env.store.getSale(sale.id))!.paymentId!;
    await env.approvePayment(paymentId);
    env.deliver(
      (await env.store.getPayment(paymentId))!.incomingPaymentUrl,
      cop("1000000"),
    );
    await env.sales.refresh(sale.id);
    return sale.id;
  };
  return { ...env, dashboard, sell };
}

describe("merchant dashboard", () => {
  it("shows today's sales and how they were split", async () => {
    const env = setup();
    const merchantId = await env.onboardRosa();
    await env.sell(merchantId);
    env.clock.now = new Date(env.clock.now.getTime() + 60_000);
    await env.sales.createSale(merchantId, { amount: "5000" }); // not paid yet

    const view = await env.dashboard.get(merchantId);

    expect(view.status).toBe("active");
    expect(view.today).toEqual({
      salesCount: 1,
      gross: cop("1000000"),
      kept: cop("800000"),
      allocated: cop("200000"),
      byRule: [
        {
          ruleId: expect.any(String),
          label: "Microcrédito",
          amount: cop("150000"),
        },
        {
          ruleId: expect.any(String),
          label: "Fondo de emergencia",
          amount: cop("50000"),
        },
      ],
    });
    // The microcredit's share is reserved until its due day: nothing reached the creditor yet.
    expect(view.rules[0]).toMatchObject({
      reserved: cop("150000"),
      paidOutThisMonth: cop("0"),
      repaid: cop("0"),
      outstanding: cop("30000000"),
    });
    expect(view.payouts).toEqual([]);
    expect(view.sales.map((sale) => sale.status)).toEqual(["open", "paid"]);
  });

  it("keeps a seven-day income history in Bogotá days", async () => {
    const env = setup();
    const merchantId = await env.onboardRosa();
    await env.sell(merchantId);
    env.clock.now = new Date(env.clock.now.getTime() + 24 * 60 * 60 * 1000);

    const view = await env.dashboard.get(merchantId);

    expect(view.today.salesCount).toBe(0);
    expect(view.history).toHaveLength(7);
    expect(view.history.at(-2)).toEqual({
      date: "2026-10-16",
      salesCount: 1,
      gross: cop("1000000"),
    });
    expect(view.history.at(-1)).toEqual({
      date: "2026-10-17",
      salesCount: 0,
      gross: cop("0"),
    });
  });

  it("reports the grant's spent amount only in the merchant's currency", async () => {
    const env = setup();
    const merchantId = await env.onboardRosa();

    // The shared fake answers in USD; a COP merchant must not show it.
    expect((await env.dashboard.get(merchantId)).spentThisMonth).toBeNull();

    env.ops.getGrantSpentAmounts.mockResolvedValue({
      spentDebitAmount: cop("200000"),
      spentReceiveAmount: null,
    });
    expect((await env.dashboard.get(merchantId)).spentThisMonth).toEqual(
      cop("200000"),
    );
  });
});
