import { OpenPaymentsClientError } from "@interledger/open-payments";
import { describe, expect, it } from "vitest";
import { ALICE, BOB, COOP, SAVINGS } from "./fakeOperations.js";
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
  it("splits a paid sale: 1,500 to the microcredit, 500 to savings, 8,000 stay", async () => {
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
      ["Microcrédito", COOP, "150000", "processing"],
      ["Fondo de emergencia", SAVINGS, "50000", "processing"],
    ]);
    // Each share leaves Rosa's wallet with the token of her daily-capped grant.
    const charges = env.ops.createOutgoingPayment.mock.calls.slice(1);
    expect(charges.map(([sender, token]) => [sender.id, token])).toEqual([
      [BOB, "outgoing-token"],
      [BOB, "outgoing-token"],
    ]);
    expect(env.ops.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({ id: BOB }),
      {
        receiver: expect.any(String),
        debitAmount: cop("150000"),
      },
    );
    const [microcredit, savings] = (await env.merchants.require(merchantId)).rules;
    expect(microcredit).toMatchObject({
      repaid: cop("150000"),
      outstanding: cop("29850000"),
    });
    expect(savings).toMatchObject({ repaid: cop("50000") });
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

    // One outgoing payment for the customer, plus one per rule.
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(3);
  });

  it("fits the split into what is left of the daily cap", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);
    // Cap is 30,000 COP and 29,000 were already spent today.
    env.ops.getGrantSpentAmounts.mockResolvedValue({
      spentDebitAmount: cop("2900000"),
      spentReceiveAmount: null,
    });

    const sale = await env.sales.refresh(saleId);

    expect(
      sale.settlement.items.map((i) => [i.amount.value, i.capped, i.status]),
    ).toEqual([
      ["100000", true, "processing"],
      ["0", true, "skipped"],
    ]);
    expect(sale.settlement.kept).toEqual(cop("900000"));
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

  it("marks a repayment that could not be sent as failed and leaves the debt untouched", async () => {
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
      "failed",
      "processing",
    ]);
    expect(sale.settlement.items[0]?.error).toContain("insufficient grant");
    expect(sale.settlement.kept).toEqual(cop("950000"));
    expect((await env.merchants.require(merchantId)).rules[0]).toMatchObject({
      repaid: cop("0"),
      outstanding: cop("30000000"),
    });
  });

  it("follows each repayment until it arrives", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const saleId = await paidSale(env, merchantId);
    const settled = await env.sales.refresh(saleId);

    for (const item of settled.settlement.items) {
      env.deliver(
        (await env.store.getPayment(item.paymentId!))!.incomingPaymentUrl,
        cop("5000000"),
      );
    }
    const sale = await env.sales.refresh(saleId);

    expect(sale.settlement.items.map((i) => i.status)).toEqual([
      "completed",
      "completed",
    ]);
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
