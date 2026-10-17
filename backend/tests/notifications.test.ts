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

const MICROCREDIT = {
  label: "Microcrédito",
  category: "Microcréditos",
  kind: "debt" as const,
  destination: COOP,
  sharePercent: 15,
  monthlyQuota: "20000",
  dueDay: 18,
};

const text = (s: string) => s.replace(/\s/g, " ");

describe("notifications", () => {
  it("reminds the shopkeeper of a creditor's payment in the days before it", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);

    // The 16th, two days before: what is reserved, and what will come from profit.
    const [due] = (await env.dashboard.get(id)).notifications;
    expect(due).toMatchObject({ kind: "payout-due", tone: "info", title: "En 2 días le pagas a Microcrédito" });
    expect(text(due!.text)).toBe(
      "Ya tienes $ 1.500 apartados. Para la cuota de $ 20.000 faltan $ 18.500, que saldrán de tus ganancias.",
    );

    env.clock.now = new Date("2026-10-17T15:00:00Z");
    expect((await env.dashboard.get(id)).notifications[0]!.title).toBe("Mañana le pagas a Microcrédito");

    // Paid on its day: the reminder goes, the payment shows instead.
    env.clock.now = new Date("2026-10-18T15:00:00Z");
    await env.payouts.runDue();
    const [payout] = await env.store.listPayouts(id);
    env.deliver((await env.store.getPayment(payout!.paymentId!))!.incomingPaymentUrl, cop("5000000"));
    const after = (await env.dashboard.get(id)).notifications;
    expect(after.map((n) => n.kind)).toEqual(["payout-sent"]);
    expect(text(after[0]!.title)).toBe("Le pagaste $ 20.000 a Microcrédito");
    expect(text(after[0]!.text)).toBe("$ 18.500 salieron de tus ganancias para completar la cuota del mes.");
  });

  it("puts a failed payout first, with the two ways to resolve it, until it is resolved", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await sellAndPay(env, id);
    env.ops.createOutgoingPayment.mockRejectedValueOnce(new Error("timeout"));
    const [failed] = await env.payouts.pay(id, { reason: "manual" });

    const [first] = (await env.dashboard.get(id)).notifications;
    expect(first).toMatchObject({
      kind: "payout-failed",
      tone: "bad",
      payoutId: failed!.id,
      actions: ["retry", "mark-paid"],
    });
    expect(first!.text).toMatch(/si el dinero llegó, márcalo como pagado; si no, reintenta el pago/);

    await env.payouts.markPaid(id, failed!.id);
    const after = (await env.dashboard.get(id)).notifications;
    expect(after.some((n) => n.kind === "payout-failed")).toBe(false);
    expect(after.find((n) => n.kind === "payout-sent")!.text).toBe(
      "Lo marcaste como pagado después de revisarlo.",
    );
  });

  it("says when the monthly consent is missing", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await env.flows.revokeMandate((await env.store.getMerchant(id))!.mandateId);

    const kinds = (await env.dashboard.get(id)).notifications.map((n) => n.kind);
    expect(kinds).toContain("consent");
  });
});
