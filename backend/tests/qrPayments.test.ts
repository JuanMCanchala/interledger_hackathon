import { describe, expect, it } from "vitest";
import { ALICE, BOB, NOW } from "./fakeOperations.js";
import { BASE_URL, cop, setupMiPlante } from "./miplanteHarness.js";

const later = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

/** Rosa's shop, active, with a 10,000 COP sale waiting on the QR. */
async function openSale(amount = "10000") {
  const env = setupMiPlante();
  const merchantId = await env.onboardRosa();
  const { sale } = await env.sales.createSale(merchantId, { amount });
  return { ...env, merchantId, saleId: sale.id };
}

describe("QR payments from the wallet provider's page", () => {
  it("asks, in the single consent, to see what reaches the shop's wallet", async () => {
    const { ops } = await openSale();

    expect(ops.requestOutgoingPaymentGrant).toHaveBeenCalledTimes(1);
    expect(ops.requestOutgoingPaymentGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: BOB }),
      expect.objectContaining({ watchIncoming: true }),
    );
  });

  it("matches the customer's payment to the sale by amount, then splits it", async () => {
    const { sales, payFromProviderPage, saleId } = await openSale();
    expect((await sales.refresh(saleId)).status).toBe("open");

    payFromProviderPage(BOB, cop("1000000"), later(5_000));
    const sale = await sales.refresh(saleId);

    expect(sale.status).toBe("paid");
    expect(sale.paidByQr).toBe(true);
    expect(sale.settlement.status).toBe("done");
    expect(sale.settlement.kept).toEqual(cop("800000"));
  });

  it("accepts a payer in another currency within 2%, not a different amount", async () => {
    const { sales, payFromProviderPage, saleId } = await openSale();

    payFromProviderPage(BOB, cop("1200000"), later(1_000)); // 12,000: another sale, not this one
    expect((await sales.refresh(saleId)).status).toBe("open");

    payFromProviderPage(BOB, cop("990000"), later(2_000)); // 9,900 after conversion: 1% short
    expect((await sales.refresh(saleId)).status).toBe("paid");
  });

  it("ignores payments that reached the wallet before the sale existed", async () => {
    const { sales, payFromProviderPage, saleId } = await openSale();

    payFromProviderPage(BOB, cop("1000000"), later(-10 * 60_000));

    expect((await sales.refresh(saleId)).status).toBe("open");
  });

  it("pays the sale on screen, not one left open earlier with the same amount", async () => {
    const env = await openSale(); // left open
    env.clock.now = new Date(NOW.getTime() + 60_000);
    const { sale: onScreen } = await env.sales.createSale(env.merchantId, {
      amount: "10000",
    });

    env.payFromProviderPage(BOB, cop("1000000"), later(90_000));
    await Promise.all([
      env.sales.refresh(env.saleId),
      env.sales.refresh(onScreen.id),
      env.sales.sweep(),
    ]);

    // One payment, one sale: the most recent one before the payment.
    expect((await env.store.getSale(onScreen.id))!.status).toBe("paid");
    expect((await env.store.getSale(env.saleId))!.status).toBe("open");

    // A second payment of the same amount pays the other one.
    env.payFromProviderPage(BOB, cop("1000000"), later(120_000));
    await env.sales.refresh(env.saleId);
    expect((await env.store.getSale(env.saleId))!.status).toBe("paid");
  });

  it("never counts a payment MiPlante's own checkout created for another sale", async () => {
    const env = await openSale();
    const { sale: viaCheckout } = await env.sales.createSale(env.merchantId, {
      amount: "10000",
    });
    await env.sales.pay(viaCheckout.id, { customerWallet: ALICE });
    const checkoutIncoming = (await env.store.getPayment(
      (await env.store.getSale(viaCheckout.id))!.paymentId!,
    ))!.incomingPaymentUrl;

    // The checkout's incoming payment also shows up when listing the shop's wallet.
    env.payFromProviderPage(BOB, cop("1000000"), later(5_000), checkoutIncoming);

    expect((await env.sales.refresh(env.saleId)).status).toBe("open");
  });

  it("falls back to the checkout until the consent includes watching the wallet", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    // A consent from before QR payments.
    const mandateId = (await env.store.getMerchant(merchantId))!.mandateId;
    const mandate = (await env.store.getMandate(mandateId))!;
    await env.store.saveMandate({ ...mandate, incomingAccess: undefined });

    const { sale, payUrl } = await env.sales.createSale(merchantId, {
      amount: "10000",
    });
    expect(payUrl).toBe(`${BASE_URL}/pay.html?sale=${sale.id}`);

    // The shop can renew it from the till although it is active.
    const { redirectUrl } = await env.merchants.renewConsent(merchantId);
    expect(redirectUrl).toBeTruthy();
  });
});
