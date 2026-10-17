import { OpenPaymentsClientError } from "@interledger/open-payments";
import { describe, expect, it } from "vitest";
import { SalesService } from "../src/merchants/salesService.js";
import { ALICE } from "./fakeOperations.js";
import { BASE_URL, cop, setupMiPlante } from "./miplanteHarness.js";

/** Rosa's shop, active, with a 10,000 COP sale and its payment request. */
async function openSale() {
  const env = setupMiPlante();
  const merchantId = await env.onboardRosa();
  const { sale } = await env.sales.createSale(merchantId, { amount: "10000" });
  const request = (await env.store.getPayment(
    (await env.store.getSale(sale.id))!.paymentId!,
  ))!;
  return { ...env, merchantId, saleId: sale.id, incoming: request.incomingPaymentUrl };
}

describe("sales paid through their payment request", () => {
  it("opens the customer's wallet app on the sale's incoming payment", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const sales = new SalesService(env.flows, env.merchants, env.store, {
      frontendUrl: BASE_URL,
      walletSendUrl: "https://wallet.interledger-test.dev/send",
      now: env.now,
    });

    const { sale, payUrl } = await sales.createSale(merchantId, { amount: "10000" });

    // The send screen reads the amount and description from the incoming payment and locks them.
    const url = new URL(payUrl);
    expect(url.origin + url.pathname).toBe("https://wallet.interledger-test.dev/send");
    const incoming = (await env.store.getPayment(
      (await env.store.getSale(sale.id))!.paymentId!,
    ))!.incomingPaymentUrl;
    expect(url.searchParams.get("merchantWA")).toBe(incoming);
  });

  it("stays open until the customer pays, then is paid and split", async () => {
    const { sales, deliver, saleId, incoming } = await openSale();
    expect((await sales.refresh(saleId)).status).toBe("open");

    deliver(incoming, cop("1000000"));
    const sale = await sales.refresh(saleId);

    expect(sale.status).toBe("paid");
    expect(sale.payment?.steps.completion).toBe(true);
    expect(sale.settlement.status).toBe("done");
    expect(sale.settlement.kept).toEqual(cop("800000"));
  });

  it("is settled by the sweeper even if the till is closed", async () => {
    const { sales, deliver, store, saleId, incoming } = await openSale();
    deliver(incoming, cop("1000000"));

    await sales.sweep();

    expect((await store.getSale(saleId))!.settlement.status).toBe("done");
  });

  it("pays the same incoming payment from MiPlante's checkout", async () => {
    const { sales, ops, deliver, store, approvePayment, saleId, incoming } =
      await openSale();
    ops.createIncomingPayment.mockClear();

    await sales.pay(saleId, { customerWallet: ALICE });
    const paymentId = (await store.getSale(saleId))!.paymentId!;

    // One destination per sale, however the customer pays it.
    expect(ops.createIncomingPayment).not.toHaveBeenCalled();
    expect((await store.getPayment(paymentId))!.incomingPaymentUrl).toBe(incoming);

    await approvePayment(paymentId);
    deliver(incoming, cop("1000000"));
    expect((await sales.refresh(saleId)).status).toBe("paid");
  });

  it("fails when the request expires unpaid, and the QR falls back to the checkout", async () => {
    const { sales, ops, clock, saleId } = await openSale();
    const read = ops.readIncomingPayment.getMockImplementation()!;
    const expiresAt = new Date(clock.now.getTime() + 60_000).toISOString();
    ops.readIncomingPayment.mockImplementation(async (url, receiver) => {
      const result = await read(url, receiver);
      return { ...result, incomingPayment: { ...result.incomingPayment, expiresAt } };
    });

    clock.now = new Date(clock.now.getTime() + 2 * 60_000);
    const sale = await sales.refresh(saleId);

    expect(sale.status).toBe("failed");
    expect(sale.error).toContain("venció");
    expect(sale.payUrl).toBe(sale.checkoutUrl);
  });

  it("fails a request whose hour is over although the wallet no longer lets it be read", async () => {
    const { sales, ops, clock, saleId } = await openSale();
    // Once a payment request expires, the test wallet answers 401 to reading it.
    ops.readIncomingPayment.mockRejectedValue(
      new OpenPaymentsClientError("Unauthorized", { description: "Unauthorized", status: 401 }),
    );

    clock.now = new Date(clock.now.getTime() + 61 * 60_000);
    const sale = await sales.refresh(saleId);

    expect(sale.status).toBe("failed");
    expect(sale.error).toContain("venció sin recibir el pago");
    // And the sweeper stops asking the wallet about it.
    ops.readIncomingPayment.mockClear();
    await sales.sweep();
    expect(ops.readIncomingPayment).not.toHaveBeenCalled();
  });

  it("keeps an unreadable request open while its hour lasts, and tries again", async () => {
    const { sales, ops, saleId } = await openSale();
    ops.readIncomingPayment.mockRejectedValueOnce(new Error("fetch failed"));

    expect((await sales.refresh(saleId)).status).toBe("open");
    expect((await sales.refresh(saleId)).status).toBe("open");
    expect(ops.readIncomingPayment).toHaveBeenCalledTimes(2);
  });

  it("shows what is missing after a partial payment and completes with the rest", async () => {
    const { sales, deliver, saleId, incoming } = await openSale();

    // The customer changed the amount and sent 6,000 of the 10,000.
    deliver(incoming, cop("600000"), { completed: false });
    const partial = await sales.refresh(saleId);

    expect(partial.status).toBe("processing");
    expect(partial.pending).toEqual(cop("400000"));
    expect(partial.settlement.status).toBe("pending"); // nothing is split yet
    // The same QR stays usable: the wallet asks for exactly what is left.
    expect(partial.payUrl).not.toBe(partial.checkoutUrl);

    deliver(incoming, cop("1000000"));
    const paid = await sales.refresh(saleId);
    expect(paid.status).toBe("paid");
    expect(paid.pending).toBeUndefined();
    expect(paid.settlement.status).toBe("done");
  });

  it("fails a partially paid sale when its request expires, saying how much arrived", async () => {
    const { sales, ops, deliver, clock, saleId, incoming } = await openSale();
    deliver(incoming, cop("600000"), { completed: false });
    await sales.refresh(saleId);
    const read = ops.readIncomingPayment.getMockImplementation()!;
    const expiresAt = new Date(clock.now.getTime() + 60_000).toISOString();
    ops.readIncomingPayment.mockImplementation(async (url, receiver) => {
      const result = await read(url, receiver);
      return { ...result, incomingPayment: { ...result.incomingPayment, expiresAt } };
    });

    clock.now = new Date(clock.now.getTime() + 2 * 60_000);
    const sale = await sales.refresh(saleId);

    expect(sale.status).toBe("failed");
    expect(sale.error).toContain("llegaron 6000.00 COP");
    expect(sale.settlement.status).toBe("pending"); // a partial payment is never split
  });
});
