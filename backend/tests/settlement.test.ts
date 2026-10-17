import { OpenPaymentsClientError } from "@interledger/open-payments";
import { describe, expect, it, vi } from "vitest";
import { ALICE, BOB, COOP, SAVINGS } from "./fakeOperations.js";
import { toPublicSale } from "../src/merchants/salesService.js";
import { cop, setupMiPlante } from "./miplanteHarness.js";

/** Rosa sells 10,000 COP; the customer approves and the money arrives. */
async function paidSale(
  env: ReturnType<typeof setupMiPlante>,
  merchantId: string,
) {
  const { sale } = await env.sales.createSale(merchantId, { amount: "10000" });
  await env.sales.pay(sale.id, { customerWallet: ALICE });
  const paymentId = (await env.store.getSale(sale.id))!.paymentId!;
  await env.approvePayment(paymentId);
  env.deliver(
    (await env.store.getPayment(paymentId))!.incomingPaymentUrl,
    cop("1000000"),
  );
  return sale.id;
}

describe("settlement", () => {
  it("tries the split again when it fails before any money moves", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);
    vi.spyOn(env.merchants, "require").mockRejectedValueOnce(new Error("database down"));
    vi.spyOn(console, "warn").mockImplementationOnce(() => {});

    const failed = await env.sales.refresh(saleId);
    expect(failed.settlement).toEqual({ status: "pending", items: [] });

    const retried = await env.sales.refresh(saleId);
    expect(retried.settlement.status).toBe("done");
    expect(retried.settlement.kept).toEqual(cop("800000"));
  });

  it("shows anyone with the sale link the split, but not where the shares went", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);

    const sale = toPublicSale(await env.sales.refresh(saleId));

    expect(sale.settlement.items).toEqual([
      expect.objectContaining({ label: "Microcrédito", amount: cop("150000") }),
      expect.objectContaining({ label: "Fondo de emergencia", amount: cop("50000") }),
    ]);
    for (const item of sale.settlement.items) {
      expect(item).not.toHaveProperty("destination");
      expect(item).not.toHaveProperty("paymentId");
      expect(item).not.toHaveProperty("ruleId");
    }
  });

  it("splits a paid sale: 1,500 reserved for the microcredit, 500 to savings, 8,000 stay", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);

    const sale = await env.sales.refresh(saleId);

    expect(sale.status).toBe("paid");
    expect(sale.settlement.status).toBe("done");
    expect(sale.settlement.kept).toEqual(cop("800000"));
    expect(
      sale.settlement.items.map((item) => [
        item.label,
        item.destination,
        item.amount.value,
        item.status,
      ]),
    ).toEqual([
      ["Microcrédito", COOP, "150000", "reserved"],
      ["Fondo de emergencia", SAVINGS, "50000", "processing"],
    ]);
    // Only the savings share leaves Rosa's wallet now, with the token of her monthly-capped grant.
    // The microcredit's stays reserved in her wallet until its due day (ADR 0014).
    const charges = env.ops.createOutgoingPayment.mock.calls.slice(1);
    expect(charges.map(([sender, token]) => [sender.id, token])).toEqual([
      [BOB, "outgoing-token"],
    ]);
    expect(env.ops.createQuote).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: BOB }),
      {
        receiver: expect.any(String),
        debitAmount: cop("50000"),
      },
    );
    const [microcredit, savings] = (await env.merchants.require(merchantId)).rules;
    // Nothing reached the creditor yet: the debt is only lowered when the payout arrives.
    expect(microcredit).toMatchObject({
      repaid: cop("0"),
      outstanding: cop("30000000"),
    });
    // Savings count once their share arrives, not when it is sent.
    expect(savings).toMatchObject({ repaid: cop("0") });
    await env.deliverShares(saleId);
    expect((await env.merchants.require(merchantId)).rules[1]).toMatchObject({ repaid: cop("50000") });
  });

  it("settles exactly once, even when several screens poll at the same time", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);

    await Promise.all([
      env.sales.refresh(saleId),
      env.sales.refresh(saleId),
      env.sales.refresh(saleId),
    ]);
    await env.sales.refresh(saleId);

    // One outgoing payment for the customer, plus the savings share; the debt's is only reserved.
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(2);
    expect((await env.store.getSale(saleId))!.settlement.items).toHaveLength(2);
  });

  it("fits the split into what is left of the monthly cap", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);
    // Cap is 30,000 COP and 29,000 were already spent this month.
    env.ops.getGrantSpentAmounts.mockResolvedValue({
      spentDebitAmount: cop("2900000"),
      spentReceiveAmount: null,
    });

    const sale = await env.sales.refresh(saleId);

    expect(
      sale.settlement.items.map((i) => [i.amount.value, i.capped, i.status]),
    ).toEqual([
      ["100000", true, "reserved"],
      ["0", true, "skipped"],
    ]);
    expect(sale.settlement.kept).toEqual(cop("900000"));
  });

  it("keeps to the cap when the grant has spent nothing yet, counting what is reserved", async () => {
    const env = setupMiPlante();
    // Cap 30,000; the microcredit reserves up to its 20,000 quota; savings take 10%.
    const merchantId = await env.onboardRosa({
      rules: [
        { label: "Microcrédito", category: "Microcréditos", kind: "debt", destination: COOP, sharePercent: 15, monthlyQuota: "20000" },
        { label: "Fondo de emergencia", category: "Ahorro", kind: "savings", destination: SAVINGS, sharePercent: 10 },
      ],
    });
    // A fresh grant: the wallet reports nothing spent.
    env.ops.getGrantSpentAmounts.mockResolvedValue({ spentDebitAmount: null, spentReceiveAmount: null });
    const { sale } = await env.sales.createSale(merchantId, { amount: "200000" });
    const request = (await env.store.getPayment((await env.store.getSale(sale.id))!.paymentId!))!;
    env.deliver(request.incomingPaymentUrl, cop("20000000"));

    const settled = await env.sales.refresh(sale.id);

    // 20,000 reserved for the microcredit, so only 10,000 of the cap is left for savings (not 20,000).
    expect(settled.settlement.items.map((i) => [i.label, i.amount.value, i.status])).toEqual([
      ["Microcrédito", "2000000", "reserved"],
      ["Fondo de emergencia", "1000000", "processing"],
    ]);
  });

  it("collects nothing when the merchant revoked the authorization", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);
    await env.flows.revokeMandate((await env.merchants.require(merchantId)).mandateId);

    const sale = await env.sales.refresh(saleId);

    expect(sale.settlement).toMatchObject({
      status: "skipped",
      kept: cop("1000000"),
    });
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(1);
  });

  it("marks a savings share that could not be sent as failed", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);
    env.ops.createOutgoingPayment.mockRejectedValueOnce(
      new OpenPaymentsClientError("Forbidden", {
        description: "insufficient grant",
        status: 403,
      }),
    );

    const sale = await env.sales.refresh(saleId);

    expect(sale.settlement.items.map((i) => i.status)).toEqual([
      "reserved",
      "failed",
    ]);
    expect(sale.settlement.items[1]?.error).toContain("insufficient grant");
    expect(sale.settlement.kept).toEqual(cop("850000"));
    expect((await env.merchants.require(merchantId)).rules[1]).toMatchObject({
      repaid: cop("0"),
    });
  });

  it("follows each share it sent until it arrives", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);
    await env.sales.refresh(saleId);

    // The public view hides each share's payment; the stored sale has it.
    for (const item of (await env.store.getSale(saleId))!.settlement.items) {
      if (!item.paymentId) continue;
      env.deliver(
        (await env.store.getPayment(item.paymentId!))!.incomingPaymentUrl,
        cop("5000000"),
      );
    }
    const sale = await env.sales.refresh(saleId);

    expect(sale.settlement.items.map((i) => i.status)).toEqual([
      "reserved",
      "completed",
    ]);
  });

  it("gives a savings share that fails on its way back to the merchant", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);
    await env.sales.refresh(saleId);
    const share = (await env.store.getSale(saleId))!.settlement.items[1]!;
    const payment = (await env.store.getPayment(share.paymentId!))!;
    await env.store.savePayment({ ...payment, status: "failed", error: "rechazado" });

    const sale = await env.sales.refresh(saleId);

    expect(sale.settlement.items[1]).toMatchObject({ status: "failed" });
    expect(sale.settlement.kept).toEqual(cop("850000")); // 8,000 + the 500 that never left
    expect((await env.merchants.require(merchantId)).rules[1]).toMatchObject({ repaid: cop("0") });
  });

  it("the background sweeper settles sales nobody is watching", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);

    await env.sales.sweep();

    expect((await env.store.getSale(saleId))?.settlement.status).toBe("done");
  });

  it("collects nothing on a day without sales", async () => {
    const env = setupMiPlante();
    await env.onboardRosa();

    await env.sales.sweep();

    // Only the merchant's consent exists: no outgoing payment was ever created.
    expect(env.ops.createOutgoingPayment).not.toHaveBeenCalled();
  });
});
