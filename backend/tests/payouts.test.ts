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
  it("reserves each sale's share and pays the creditor the month's quota once, on the due day", async () => {
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

    // The 20th: one payment of the whole 20,000 quota: the 3,000 reserved and 17,000 from profit.
    env.clock.now = new Date("2026-10-20T15:00:00Z");
    await env.payouts.runDue();
    await env.payouts.runDue();
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(charges + 1);
    const [payout] = await env.store.listPayouts(id);
    expect(payout).toMatchObject({
      destination: COOP,
      amount: cop("2000000"),
      topUp: cop("1700000"),
      reason: "due-date",
      month: "2026-10",
      status: "processing",
    });

    // When the money arrives, the debt counts it as repaid.
    env.deliver((await env.store.getPayment(payout!.paymentId!))!.incomingPaymentUrl, cop("5000000"));
    const view = await env.dashboard.get(id);
    expect(view.rules[0]).toMatchObject({
      reserved: cop("0"),
      paidThisMonth: cop("2000000"), // the quota is covered: later sales this month are profit
      paidOutThisMonth: cop("2000000"),
      repaid: cop("2000000"),
      outstanding: cop("28000000"),
    });
    expect(view.payouts.map((p) => [p.amount, p.status])).toEqual([[cop("2000000"), "completed"]]);

    // With the quota covered, the next sale this month reserves nothing for it.
    const after = await sellAndPay(env, id);
    expect(after.settlement.items).toEqual([]);
  });

  it("lets the merchant pay early, and the due day then completes the rest of the quota", async () => {
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
    // 1,500 paid early; on the 21st the other 1,500 reserved plus 17,000 from profit.
    expect(payouts.map((p) => [p.reason, p.amount.value, p.topUp?.value])).toEqual([
      ["due-date", "1850000", "1700000"],
      ["manual", "150000", undefined],
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

  it("never pays the same reserved money twice, even when a click and the scheduler meet", async () => {
    const env = setupMiPlante();
    const SUPPLIER_RULE = { ...MICROCREDIT, label: "Proveedor", category: "Proveedores", destination: COOP, outstanding: undefined, monthlyQuota: "5000" };
    const id = await env.onboardRosa({ rules: [MICROCREDIT, { ...SUPPLIER_RULE, sharePercent: 10 }] });
    await sellAndPay(env, id);
    env.clock.now = new Date("2026-10-20T15:00:00Z");

    const results = await Promise.allSettled([
      env.payouts.pay(id, { reason: "manual" }),
      env.payouts.runDue(),
      env.payouts.pay(id, { reason: "manual" }),
    ]);
    await env.payouts.runDue();

    // The reserved money of each debt left once, and each debt had at most one due-day payout.
    const payouts = await env.store.listPayouts(id);
    const fromReserve = new Map<string, bigint>();
    const dueDay = new Map<string, number>();
    for (const p of payouts) {
      const reserved = BigInt(p.amount.value) - BigInt(p.topUp?.value ?? "0");
      fromReserve.set(p.ruleId, (fromReserve.get(p.ruleId) ?? 0n) + reserved);
      if (p.reason === "due-date") dueDay.set(p.ruleId, (dueDay.get(p.ruleId) ?? 0) + 1);
    }
    expect([...fromReserve.values()].sort()).toEqual([100000n, 150000n]);
    expect([...dueDay.values()].every((n) => n <= 1)).toBe(true);
    // The click that found the shop busy says so instead of paying.
    expect(results.some((r) => r.status === "rejected" && /intenta en un momento|apartado/.test(String(r.reason)))).toBe(true);
  });

  it("never pays a creditor more than what is still owed", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [{ ...MICROCREDIT, outstanding: "1000" }] });
    await sellAndPay(env, id); // 1,500 share, 1,000 owed: 1,000 reserved
    const [payout] = await env.payouts.pay(id, { reason: "manual" });
    expect(payout!.amount).toEqual(cop("100000"));
  });

  it("keeps a payout that was sent even if recording it fails afterwards", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);
    const sent = env.ops.createOutgoingPayment.mock.calls.length;
    const real = env.store.savePayout.bind(env.store);
    let writes = 0;
    env.store.savePayout = async (record) => {
      writes += 1;
      if (writes === 2) throw new Error("database down");
      return real(record);
    };

    await expect(env.payouts.pay(id, { reason: "manual" })).rejects.toThrow("database down");
    env.store.savePayout = real;

    // The charge went out; the payout stays on its way, so the money is not reserved again.
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(sent + 1);
    expect((await env.store.listPayouts(id)).map((p) => p.status)).toEqual(["processing"]);
    await expect(env.payouts.pay(id, { reason: "manual" })).rejects.toThrow(/apartado/);
  });

  it("does not let a debt with money reserved be removed or turned into savings", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    const rule = (await env.store.getMerchant(id))!.rules[0]!;
    await sellAndPay(env, id);
    const savings = {
      label: "Ahorro",
      category: "Ahorro",
      kind: "savings" as const,
      destination: "$ilp.interledger-test.dev/ahorro",
      sharePercent: 5,
    };

    await expect(env.merchants.updateRules(id, [savings])).rejects.toThrow(/apartado sin pagar/);
    await expect(
      env.merchants.updateRules(id, [{ ...savings, id: rule.id }]),
    ).rejects.toThrow(/apartado sin pagar/);

    // Paid, it can go.
    await env.payouts.pay(id, { reason: "manual" });
    const updated = await env.merchants.updateRules(id, [savings]);
    expect(updated.rules.map((r) => r.label)).toEqual(["Ahorro"]);
  });

  it("never pays a reserved balance twice when the due day and an early payment meet", async () => {
    const env = setupMiPlante();
    const supplier = { ...MICROCREDIT, label: "Distribuidora", category: "Proveedores", monthlyQuota: "5000", outstanding: undefined };
    const id = await env.onboardRosa({ rules: [supplier, MICROCREDIT] });
    await sellAndPay(env, id);
    const microcredit = (await env.store.getMerchant(id))!.rules.find((r) => r.label === "Microcrédito")!;
    env.clock.now = new Date("2026-10-20T15:00:00Z");

    // The scheduler pays both debts while the shopkeeper taps "pay now" on the microcredit.
    await Promise.all([
      env.payouts.runDue(),
      env.payouts.pay(id, { ruleId: microcredit.id, reason: "manual" }).catch(() => []),
    ]);

    const paid = (await env.store.listPayouts(id))
      .filter((p) => p.ruleId === microcredit.id && p.status !== "failed")
      .reduce((sum, p) => sum + BigInt(p.amount.value), 0n);
    expect(paid).toBe(150000n); // the 1,500 reserved, once
  });

  it("never retries a failed due-day payout on its own: it waits for the shopkeeper", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);
    env.clock.now = new Date("2026-10-20T15:00:00Z");
    env.ops.createOutgoingPayment.mockRejectedValueOnce(
      new OpenPaymentsClientError("Forbidden", { description: "insufficient funds", status: 403 }),
    );

    await env.payouts.runDue();
    const charges = env.ops.createOutgoingPayment.mock.calls.length;
    // The scheduler keeps running every minute, and the next day: no new try.
    await env.payouts.runDue();
    env.clock.now = new Date("2026-10-21T15:00:00Z");
    await env.payouts.runDue();

    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(charges);
    const [failed] = await env.store.listPayouts(id);
    expect(failed).toMatchObject({ status: "failed", reason: "due-date" });
    expect(failed!.resolvedAt).toBeUndefined();
  });

  it("retries a failed payout when the shopkeeper asks, once", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);
    env.ops.createOutgoingPayment.mockRejectedValueOnce(new Error("timeout"));
    const [failed] = await env.payouts.pay(id, { reason: "due-date" });

    const retried = await env.payouts.retry(id, failed!.id);

    expect(retried).toMatchObject({ status: "processing", reason: "due-date", amount: failed!.amount });
    const stored = await env.store.listPayouts(id);
    expect(stored.find((p) => p.id === failed!.id)).toMatchObject({ resolution: "retried" });
    await expect(env.payouts.retry(id, failed!.id)).rejects.toThrow(/revisión/);
  });

  it("marks a failed payout paid when its money did arrive, without sending it again", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);
    env.ops.createOutgoingPayment.mockRejectedValueOnce(new Error("timeout"));
    const [failed] = await env.payouts.pay(id, { reason: "manual" });
    const charges = env.ops.createOutgoingPayment.mock.calls.length;

    const paid = await env.payouts.markPaid(id, failed!.id);

    expect(paid).toMatchObject({ status: "completed", resolution: "marked-paid" });
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(charges);
    expect((await env.dashboard.get(id)).rules[0]).toMatchObject({
      reserved: cop("0"),
      repaid: cop("150000"),
    });
  });

  it("turns a payout the wallet never confirmed into one to review", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);
    // The process stopped between writing the payout and charging it.
    const ruleId = (await env.store.getMerchant(id))!.rules[0]!.id;
    await env.store.savePayout({
      id: "00000000-0000-4000-8000-000000000001",
      merchantId: id,
      ruleId,
      label: "Microcrédito",
      destination: COOP,
      amount: cop("150000"),
      reason: "manual",
      month: "2026-10",
      status: "processing",
      createdAt: env.clock.now.toISOString(),
      updatedAt: env.clock.now.toISOString(),
    });

    env.clock.now = new Date(env.clock.now.getTime() + 11 * 60_000);
    await env.payouts.refresh(id);

    const [stuck] = await env.store.listPayouts(id);
    expect(stuck).toMatchObject({ status: "failed", error: "No pudimos confirmar si el pago salió" });
  });

  it("takes from profit only what the monthly cap and the debt allow", async () => {
    const env = setupMiPlante();
    // Quota 20,000 but only 2,500 still owed: the due day sends 2,500, not the whole quota.
    const owed = await env.onboardRosa({ rules: [{ ...MICROCREDIT, outstanding: "2500" }] });
    await sellAndPay(env, owed);
    const [byDebt] = await env.payouts.pay(owed, { reason: "due-date" });
    expect(byDebt).toMatchObject({ amount: cop("250000"), topUp: cop("100000") });

    // A cap of 30,000 with 29,000 already spent: only 1,000 of room beyond what is reserved.
    const capped = setupMiPlante();
    const shop = await capped.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(capped, shop);
    capped.ops.getGrantSpentAmounts.mockResolvedValue({
      spentDebitAmount: cop("2750000"),
      spentReceiveAmount: null,
    });
    const [byCap] = await capped.payouts.pay(shop, { reason: "due-date" });
    // 1,500 reserved + 1,000 of room left (30,000 - 27,500 - 1,500 reserved).
    expect(byCap).toMatchObject({ amount: cop("250000"), topUp: cop("100000") });
  });
});
