import { OpenPaymentsClientError } from "@interledger/open-payments";
import { describe, expect, it } from "vitest";
import { COOP } from "./fakeOperations.js";
import { cop, setupMiPlante } from "./miplanteHarness.js";

/** Sells `amount` COP and has the customer pay the sale's payment request. */
async function sellAndPay(env: ReturnType<typeof setupMiPlante>, merchantId: string, amount = "10000") {
  const { sale } = await env.sales.createSale(merchantId, { amount });
  const request = (await env.store.getPayment((await env.store.getSale(sale.id))!.paymentId!))!;
  env.deliver(request.incomingPaymentUrl, cop(`${amount}00`));
  return env.sales.refresh(sale.id);
}

/** Rosa's microcredit takes 15% of each sale, up to 20,000 a month, paid on the 20th. */
const MICROCREDIT = {
  label: "Microcrédito",
  category: "Microcréditos",
  kind: "debt" as const,
  destination: COOP,
  sharePercent: 15,
  monthlyQuota: "20000",
  outstanding: "300000",
  dueDay: 20,
};

describe("paying creditors on their due day", () => {
  it("reserves each sale's share and pays the creditor once, on the due day", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);
    await sellAndPay(env, id);
    const charges = env.ops.createOutgoingPayment.mock.calls.length;

    // The 16th: before the due day, nothing leaves Rosa's wallet.
    await env.payouts.runDue();
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(charges);
    expect((await env.dashboard.get(id)).rules[0]).toMatchObject({
      reserved: cop("300000"),
      paidThisMonth: cop("300000"),
    });

    // The 20th: one payment with everything reserved.
    env.clock.now = new Date("2026-10-20T15:00:00Z");
    await env.payouts.runDue();
    await env.payouts.runDue();
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(charges + 1);
    const [payout] = await env.store.listPayouts(id);
    expect(payout).toMatchObject({
      destination: COOP,
      amount: cop("300000"),
      reason: "due-date",
      month: "2026-10",
      status: "processing",
    });

    // When the money arrives, the debt counts it as repaid.
    env.deliver((await env.store.getPayment(payout!.paymentId!))!.incomingPaymentUrl, cop("5000000"));
    const view = await env.dashboard.get(id);
    expect(view.rules[0]).toMatchObject({
      reserved: cop("0"),
      paidOutThisMonth: cop("300000"),
      repaid: cop("300000"),
      outstanding: cop("29700000"),
    });
    expect(view.payouts.map((p) => [p.amount, p.status])).toEqual([[cop("300000"), "completed"]]);
  });

  it("lets the merchant pay early, and the due day then pays only what was reserved since", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    const ruleId = (await env.store.getMerchant(id))!.rules[0]!.id;
    await sellAndPay(env, id);

    const [early] = await env.payouts.pay(id, { ruleId, reason: "manual" });
    expect(early).toMatchObject({ amount: cop("150000"), reason: "manual" });
    await expect(env.payouts.pay(id, { ruleId, reason: "manual" })).rejects.toThrow(/apartado/);

    await sellAndPay(env, id);
    env.clock.now = new Date("2026-10-21T15:00:00Z");
    await env.payouts.runDue();
    const payouts = await env.store.listPayouts(id);
    expect(payouts.map((p) => [p.reason, p.amount.value])).toEqual([
      ["due-date", "150000"],
      ["manual", "150000"],
    ]);
  });

  it("can run the due day now, for the demo, without paying it twice that month", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);

    const sent = await env.payouts.pay(id, { reason: "due-date" });
    expect(sent).toHaveLength(1);

    env.clock.now = new Date("2026-10-25T15:00:00Z");
    const charges = env.ops.createOutgoingPayment.mock.calls.length;
    await env.payouts.runDue();
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(charges);
  });

  it("keeps the money reserved when a payout cannot be sent", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);
    env.ops.createOutgoingPayment.mockRejectedValueOnce(
      new OpenPaymentsClientError("Forbidden", { description: "insufficient funds", status: 403 }),
    );

    const [failed] = await env.payouts.pay(id, { reason: "manual" });
    expect(failed).toMatchObject({ status: "failed" });
    expect(failed!.error).toContain("insufficient funds");
    expect((await env.dashboard.get(id)).rules[0]).toMatchObject({ reserved: cop("150000") });

    const [retry] = await env.payouts.pay(id, { reason: "manual" });
    expect(retry).toMatchObject({ status: "processing", amount: cop("150000") });
  });

  it("refuses to pay with nothing reserved or without an active authorization", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await expect(env.payouts.pay(id, { reason: "manual" })).rejects.toThrow(/apartado/);

    await sellAndPay(env, id);
    await env.flows.revokeMandate((await env.store.getMerchant(id))!.mandateId);
    await expect(env.payouts.pay(id, { reason: "manual" })).rejects.toThrow(/autorización/);
  });

  it("gives a debt without a due day the 28th", async () => {
    const env = setupMiPlante();
    const { dueDay: _, ...withoutDay } = MICROCREDIT;
    const id = await env.onboardRosa({ rules: [withoutDay] });
    expect((await env.store.getMerchant(id))!.rules[0]!.dueDay).toBe(28);
  });
});
