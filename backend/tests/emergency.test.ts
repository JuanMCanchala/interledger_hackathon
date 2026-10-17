import { describe, expect, it } from "vitest";
import { BOB, COOP, SAVINGS } from "./fakeOperations.js";
import { cop, setupMiPlante } from "./miplanteHarness.js";

const MICROCREDIT = {
  label: "Microcrédito",
  category: "Microcréditos",
  kind: "debt" as const,
  destination: COOP,
  sharePercent: 15,
  monthlyQuota: "20000",
  dueDay: 20,
};
const FUND = {
  label: "Fondo de emergencia",
  category: "Ahorro",
  kind: "savings" as const,
  destination: SAVINGS,
  sharePercent: 5,
};

describe("the emergency fund as a last resort", () => {
  it("asks for a second consent, on the savings wallet, capped like the shop's", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT, FUND] });

    const { merchant, redirectUrl } = await env.merchants.authorizeEmergency(id);

    expect(redirectUrl).toBeTruthy();
    expect(merchant.emergency).toMatchObject({ label: "Fondo de emergencia", status: "awaiting-consent" });
    const stored = (await env.store.getMerchant(id))!;
    const mandate = await env.flows.findMandate(stored.emergency!.mandateId);
    expect(mandate).toMatchObject({ sender: SAVINGS, maxAmount: stored.monthlyCap });

    await env.approveMandate(stored.emergency!.mandateId);
    expect((await env.merchants.view((await env.store.getMerchant(id))!)).emergency!.status).toBe("active");
    // Like the shop's own grant, the sandbox's public routes cannot reach it.
    expect(await env.store.isMerchantMandate(stored.emergency!.mandateId)).toBe(true);
  });

  it("needs a savings wallet to keep as the last resort", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await expect(env.merchants.authorizeEmergency(id)).rejects.toThrow(/billetera de ahorro/);
  });

  /** A shop whose emergency fund is authorized, with 1,500 reserved and 500 saved from one sale. */
  async function shopWithFund() {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT, FUND] });
    const { sale } = await env.sales.createSale(id, { amount: "10000" });
    const request = (await env.store.getPayment((await env.store.getSale(sale.id))!.paymentId!))!;
    env.deliver(request.incomingPaymentUrl, cop("1000000"));
    await env.sales.refresh(sale.id);
    await env.deliverShares(sale.id);
    await env.merchants.authorizeEmergency(id);
    await env.approveMandate((await env.store.getMerchant(id))!.emergency!.mandateId);
    return { env, id };
  }

  it("moves a failed payout's amount from the fund to the shop, then sends it again", async () => {
    const { env, id } = await shopWithFund();
    env.ops.createOutgoingPayment.mockRejectedValueOnce(new Error("insufficient funds"));
    const [failed] = await env.payouts.pay(id, { reason: "manual" });
    // The fund is only offered, never used on its own.
    const offered = (await env.dashboard.get(id)).notifications.find((n) => n.payoutId === failed!.id)!;
    expect(offered.actions).toEqual(["retry", "mark-paid", "use-emergency"]);

    const drawing = await env.payouts.useEmergency(id, failed!.id);

    // From the savings wallet to the shop's, for the payout's amount.
    const [sender, , quote] = env.ops.createOutgoingPayment.mock.calls.at(-1)!;
    expect(sender.id).toBe(SAVINGS);
    expect(quote).toMatchObject({ quoteId: expect.any(String) });
    expect(env.ops.createQuote).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: SAVINGS }),
      expect.objectContaining({ debitAmount: cop("150000") }),
    );
    expect(drawing.emergencyDraw).toMatchObject({ amount: cop("150000"), status: "processing" });
    expect((await env.dashboard.get(id)).notifications[0]!.title).toMatch(/Usando tu fondo de emergencia/);

    // The money arrives in the shop: the payout goes out again and the fund's progress goes down.
    const drawPayment = (await env.store.getPayment(drawing.emergencyDraw!.paymentId!))!;
    expect(drawPayment.receiver).toBe(BOB);
    env.deliver(drawPayment.incomingPaymentUrl, cop("5000000"));
    await env.payouts.refresh(id);

    const payouts = await env.store.listPayouts(id);
    expect(payouts.find((p) => p.id === failed!.id)).toMatchObject({
      resolution: "retried",
      emergencyDraw: { status: "completed", counted: true },
    });
    expect(payouts.find((p) => p.id !== failed!.id)).toMatchObject({ status: "processing", amount: cop("150000") });
    const fund = (await env.store.getMerchant(id))!.rules.find((r) => r.kind === "savings")!;
    expect(fund.repaid).toEqual(cop("-100000")); // 500 saved, 1,500 taken back
    // Refreshing again neither counts the move twice nor sends another payout.
    await env.payouts.refresh(id);
    expect((await env.store.listPayouts(id))).toHaveLength(2);
    expect((await env.store.getMerchant(id))!.rules.find((r) => r.kind === "savings")!.repaid).toEqual(cop("-100000"));
  });

  it("says so when the fund could not be used, and offers it again", async () => {
    const { env, id } = await shopWithFund();
    env.ops.createOutgoingPayment.mockRejectedValueOnce(new Error("insufficient funds"));
    const [failed] = await env.payouts.pay(id, { reason: "manual" });
    env.ops.createOutgoingPayment.mockRejectedValueOnce(new Error("fondo vacío"));

    const drawing = await env.payouts.useEmergency(id, failed!.id);

    expect(drawing.emergencyDraw).toMatchObject({ status: "failed" });
    const notice = (await env.dashboard.get(id)).notifications.find((n) => n.payoutId === failed!.id)!;
    expect(notice.text).toMatch(/No se pudo sacar de tu fondo de emergencia: .*fondo vacío/);
    expect(notice.actions).toContain("use-emergency");
  });

  it("is not offered nor usable without an approved emergency grant", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT, FUND] });
    const { sale } = await env.sales.createSale(id, { amount: "10000" });
    const request = (await env.store.getPayment((await env.store.getSale(sale.id))!.paymentId!))!;
    env.deliver(request.incomingPaymentUrl, cop("1000000"));
    await env.sales.refresh(sale.id);
    env.ops.createOutgoingPayment.mockRejectedValueOnce(new Error("insufficient funds"));
    const [failed] = await env.payouts.pay(id, { reason: "manual" });

    const notice = (await env.dashboard.get(id)).notifications.find((n) => n.payoutId === failed!.id)!;
    expect(notice.actions).toEqual(["retry", "mark-paid"]);
    await expect(env.payouts.useEmergency(id, failed!.id)).rejects.toThrow(/Autoriza primero/);
  });
});
