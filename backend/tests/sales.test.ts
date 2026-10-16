import { describe, expect, it } from "vitest";
import { ALICE, BOB } from "./fakeOperations.js";
import { BASE_URL, cop, setupMiPlante } from "./miplanteHarness.js";

describe("checkout", () => {
  it("puts the shop's wallet address in the QR, so it opens the provider's payment page", async () => {
    const { sales, onboardRosa } = setupMiPlante();
    const merchantId = await onboardRosa();

    const { sale, payUrl, checkoutUrl } = await sales.createSale(merchantId, {
      amount: "10000",
      description: "Mercado",
    });

    expect(payUrl).toBe(BOB);
    expect(sale.payUrl).toBe(payUrl);
    // MiPlante's own checkout stays available for typing the wallet name.
    expect(checkoutUrl).toBe(`${BASE_URL}/pay?sale=${sale.id}`);
    expect(sale).toMatchObject({
      merchantName: "Tienda Doña Rosa",
      amount: cop("1000000"),
      status: "open",
      settlement: { status: "pending", items: [] },
    });
  });

  it("asks the customer to approve the payment in their own wallet", async () => {
    const { sales, ops, store, onboardRosa } = setupMiPlante();
    const merchantId = await onboardRosa();
    const { sale } = await sales.createSale(merchantId, { amount: "10000" });

    const { sale: paying, redirectUrl } = await sales.pay(sale.id, {
      customerWallet: "$ilp.interledger-test.dev/alice",
    });

    expect(redirectUrl).toBe("https://wallet.interledger-test.dev/consent/1");
    expect(ops.createIncomingPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: BOB }),
      {
        incomingAmount: cop("1000000"),
        description: "Tienda Doña Rosa",
      },
    );
    expect(ops.requestOutgoingPaymentGrant).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: ALICE }),
      expect.anything(),
    );
    expect(paying).toMatchObject({
      status: "awaiting-consent",
      customer: ALICE,
    });
    expect((await store.getPayment((await store.getSale(sale.id))!.paymentId!))?.returnTo).toBe(
      `/pay?sale=${sale.id}`,
    );
  });

  it("walks through the four Open Payments steps until the sale is paid", async () => {
    const { sales, deliver, store, approvePayment, onboardRosa } =
      setupMiPlante();
    const merchantId = await onboardRosa();
    const { sale } = await sales.createSale(merchantId, { amount: "10000" });
    await sales.pay(sale.id, { customerWallet: ALICE });
    const paymentId = (await store.getSale(sale.id))!.paymentId!;

    await approvePayment(paymentId);
    const moving = await sales.refresh(sale.id);
    expect(moving.status).toBe("processing");
    expect(moving.payment?.steps).toEqual({
      request: true,
      authorization: true,
      execution: true,
      completion: false,
    });

    deliver((await store.getPayment(paymentId))!.incomingPaymentUrl, cop("1000000"));
    const paid = await sales.refresh(sale.id);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBeDefined();
    expect(paid.payment?.steps.completion).toBe(true);
  });

  it("lets the customer try again after rejecting in the wallet", async () => {
    const { sales, flows, store, onboardRosa } = setupMiPlante();
    const merchantId = await onboardRosa();
    const { sale } = await sales.createSale(merchantId, { amount: "10000" });
    await sales.pay(sale.id, { customerWallet: ALICE });
    const firstPayment = (await store.getSale(sale.id))!.paymentId!;

    await flows.completePayment(firstPayment, { result: "grant_rejected" });
    expect((await sales.refresh(sale.id)).status).toBe("failed");

    await sales.pay(sale.id, { customerWallet: ALICE });
    expect((await store.getSale(sale.id))!.paymentId).not.toBe(firstPayment);
  });

  it("does not start a second payment for a sale that is being paid", async () => {
    const { sales, onboardRosa } = setupMiPlante();
    const merchantId = await onboardRosa();
    const { sale } = await sales.createSale(merchantId, { amount: "10000" });
    await sales.pay(sale.id, { customerWallet: ALICE });

    await expect(
      sales.pay(sale.id, { customerWallet: ALICE }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects amounts with more decimals than the merchant's currency allows", async () => {
    const { sales, onboardRosa } = setupMiPlante();
    const merchantId = await onboardRosa();

    await expect(sales.createSale(merchantId, { amount: "10.001" })).rejects.toThrow(
      "decimales",
    );
  });
});
