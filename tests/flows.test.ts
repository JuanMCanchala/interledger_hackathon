import { OpenPaymentsClientError, mockQuote } from "@interledger/open-payments";
import { describe, expect, it } from "vitest";
import { PaymentFlows } from "../src/openPayments/flows.js";
import { computeInteractHash } from "../src/openPayments/hash.js";
import type { Interaction } from "../src/openPayments/records.js";
import { Store } from "../src/storage/store.js";
import {
  ALICE,
  AUTH_SERVER,
  BOB,
  NOW,
  createFakeOperations,
} from "./fakeOperations.js";

const BASE_URL = "http://localhost:3000";
const usd = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });
const cop = (value: string) => ({ value, assetCode: "COP", assetScale: 2 });

function setup() {
  const clock = { now: NOW };
  const { ops, deliver } = createFakeOperations();
  const store = new Store();
  const flows = new PaymentFlows(ops, store, {
    publicBaseUrl: BASE_URL,
    allowedWalletHosts: ["ilp.interledger-test.dev"],
    now: () => clock.now,
  });
  /** What the wallet appends to the finish URL when the user approves. */
  const approve = (interaction: Interaction) => ({
    interactRef: "ref-1",
    hash: computeInteractHash({
      clientNonce: interaction.clientNonce,
      interactNonce: interaction.finishNonce,
      interactRef: "ref-1",
      authServerUrl: AUTH_SERVER,
    }),
  });
  const paymentInteraction = (id: string) => store.getPayment(id)!.interaction!;
  const mandateInteraction = (id: string) => store.getMandate(id)!.interaction!;
  const activeMandate = async (interval?: string) => {
    const { mandate } = await flows.startMandate({
      sender: ALICE,
      maxAmount: "20",
      interval,
    });
    await flows.completeMandate(
      mandate.id,
      approve(mandateInteraction(mandate.id)),
    );
    return mandate.id;
  };
  return {
    clock,
    ops,
    deliver,
    store,
    flows,
    approve,
    paymentInteraction,
    activeMandate,
  };
}

describe("one-off payment", () => {
  it("creates the payment request, the quote and the consent grant", async () => {
    const { flows, ops, store } = setup();
    const { payment, redirectUrl } = await flows.startPayment({
      sender: "$ilp.interledger-test.dev/alice",
      receiver: BOB,
      amount: "50000",
      description: "Aporte semanal",
    });

    expect(redirectUrl).toBe("https://wallet.interledger-test.dev/consent/1");
    expect(ops.createIncomingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: BOB }),
      {
        incomingAmount: cop("5000000"),
        description: "Aporte semanal",
      },
    );
    expect(ops.requestOutgoingPaymentGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: ALICE }),
      expect.objectContaining({
        limits: { debitAmount: usd("1300") },
        finishUri: `${BASE_URL}/api/payments/${payment.id}/callback`,
      }),
    );
    expect(payment.status).toBe("awaiting-consent");
    expect(payment.steps).toEqual({
      request: true,
      authorization: false,
      execution: false,
      completion: false,
    });
    expect(payment).not.toHaveProperty("interaction");
    expect(payment).not.toHaveProperty("incomingToken");
    expect(store.getPayment(payment.id)?.interaction?.authServer).toBe(
      AUTH_SERVER,
    );
  });

  it("pays after consent and completes when the money arrives", async () => {
    const { flows, ops, deliver, approve, paymentInteraction } = setup();
    const { payment } = await flows.startPayment({
      sender: ALICE,
      receiver: BOB,
      amount: "50000",
    });

    const processing = await flows.completePayment(
      payment.id,
      approve(paymentInteraction(payment.id)),
    );
    expect(ops.continueGrant).toHaveBeenCalledWith(
      { uri: `${AUTH_SERVER}/continue/1`, accessToken: "continue-token" },
      "ref-1",
    );
    expect(ops.createOutgoingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: ALICE }),
      "outgoing-token",
      { quoteId: payment.quoteId, description: undefined },
    );
    expect(processing.status).toBe("processing");
    expect(processing.steps).toMatchObject({
      authorization: true,
      execution: true,
      completion: false,
    });

    deliver(payment.incomingPaymentUrl, cop("5000000"));
    const done = await flows.refreshPayment(payment.id);
    expect(done.status).toBe("completed");
    expect(done.receivedAmount).toEqual(cop("5000000"));
    expect(done.steps).toEqual({
      request: true,
      authorization: true,
      execution: true,
      completion: true,
    });
  });

  it("does not pay twice when the callback is opened again", async () => {
    const { flows, ops, approve, paymentInteraction } = setup();
    const { payment } = await flows.startPayment({
      sender: ALICE,
      receiver: BOB,
      amount: "10",
    });
    const params = approve(paymentInteraction(payment.id));

    await flows.completePayment(payment.id, params);
    await flows.completePayment(payment.id, params);

    expect(ops.continueGrant).toHaveBeenCalledTimes(1);
    expect(ops.createOutgoingPayment).toHaveBeenCalledTimes(1);
  });

  it("discards a callback with a wrong hash without paying", async () => {
    const { flows, ops } = setup();
    const { payment } = await flows.startPayment({
      sender: ALICE,
      receiver: BOB,
      amount: "10",
    });

    const result = await flows.completePayment(payment.id, {
      interactRef: "ref-1",
      hash: "forged",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("hash");
    expect(ops.continueGrant).not.toHaveBeenCalled();
    expect(ops.createOutgoingPayment).not.toHaveBeenCalled();
  });

  it("marks the payment as rejected when the user declines in the wallet", async () => {
    const { flows, ops } = setup();
    const { payment } = await flows.startPayment({
      sender: ALICE,
      receiver: BOB,
      amount: "10",
    });

    const result = await flows.completePayment(payment.id, {
      result: "grant_rejected",
    });

    expect(result.status).toBe("rejected");
    expect(ops.continueGrant).not.toHaveBeenCalled();
  });

  it("quotes again when the quote expired during consent", async () => {
    const { flows, ops, clock, approve, paymentInteraction } = setup();
    const { payment } = await flows.startPayment({
      sender: ALICE,
      receiver: BOB,
      amount: "50000",
    });
    clock.now = new Date(NOW.getTime() + 10 * 60_000);

    await flows.completePayment(
      payment.id,
      approve(paymentInteraction(payment.id)),
    );

    expect(ops.createQuote).toHaveBeenCalledTimes(2);
    const [, , options] = ops.createOutgoingPayment.mock.calls[0]!;
    expect(options).toMatchObject({
      quoteId: "https://ilp.interledger-test.dev/quotes/q-2",
    });
  });

  it("fails if the new quote costs more than what the user approved", async () => {
    const { flows, ops, clock, store, approve, paymentInteraction } = setup();
    const { payment } = await flows.startPayment({
      sender: ALICE,
      receiver: BOB,
      amount: "50000",
    });
    clock.now = new Date(NOW.getTime() + 10 * 60_000);
    ops.createQuote.mockResolvedValueOnce(
      mockQuote({ id: "q-expensive", debitAmount: usd("1500") }),
    );

    await expect(
      flows.completePayment(
        payment.id,
        approve(paymentInteraction(payment.id)),
      ),
    ).rejects.toThrow("supera el monto que autorizaste");

    expect(store.getPayment(payment.id)?.status).toBe("failed");
    expect(ops.createOutgoingPayment).not.toHaveBeenCalled();
  });

  it("refuses wallet hosts outside the allowlist", async () => {
    const { flows, ops } = setup();
    await expect(
      flows.startPayment({
        sender: "https://evil.example/alice",
        receiver: BOB,
        amount: "10",
      }),
    ).rejects.toThrow("no está permitido");
    expect(ops.getWalletAddress).not.toHaveBeenCalledWith(
      "https://evil.example/alice",
    );
  });
});

describe("mandates", () => {
  it("asks for consent once with a debit cap per interval", async () => {
    const { flows, ops, store, approve } = setup();
    const { mandate, redirectUrl } = await flows.startMandate({
      sender: ALICE,
      maxAmount: "20",
      interval: "P1W",
    });

    expect(redirectUrl).toBe("https://wallet.interledger-test.dev/consent/1");
    expect(ops.requestOutgoingPaymentGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: ALICE }),
      expect.objectContaining({
        limits: {
          debitAmount: usd("2000"),
          interval: "R/2026-10-16T15:00:00Z/P1W",
        },
        finishUri: `${BASE_URL}/api/mandates/${mandate.id}/callback`,
      }),
    );

    const active = await flows.completeMandate(
      mandate.id,
      approve(store.getMandate(mandate.id)!.interaction!),
    );
    expect(active.status).toBe("active");
    expect(active).not.toHaveProperty("token");
    expect(store.getMandate(mandate.id)?.token?.value).toBe("outgoing-token");
  });

  it("charges several times without asking for consent again", async () => {
    const { flows, ops, activeMandate } = setup();
    const id = await activeMandate("P1W");

    const first = await flows.chargeMandate(id, {
      receiver: BOB,
      amount: "50000",
    });
    await flows.chargeMandate(id, { receiver: BOB, amount: "50000" });

    expect(ops.requestOutgoingPaymentGrant).toHaveBeenCalledTimes(1);
    expect(ops.createOutgoingPayment).toHaveBeenCalledTimes(2);
    expect(ops.createOutgoingPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: ALICE }),
      "outgoing-token",
      expect.objectContaining({ quoteId: expect.any(String) }),
    );
    expect(first.kind).toBe("mandate-charge");
    expect(first.steps.authorization).toBe(true);

    const details = await flows.getMandate(id);
    expect(details.spent?.debitAmount).toEqual(usd("1300"));
    expect(details.payments).toHaveLength(2);
  });

  it("rotates the access token before it expires", async () => {
    const { flows, ops, clock, activeMandate } = setup();
    const id = await activeMandate();
    clock.now = new Date(NOW.getTime() + 20 * 60_000);

    await flows.chargeMandate(id, { receiver: BOB, amount: "1000" });

    expect(ops.rotateToken).toHaveBeenCalledTimes(1);
    expect(ops.createOutgoingPayment).toHaveBeenCalledWith(
      expect.anything(),
      "rotated-token",
      expect.anything(),
    );
  });

  it("rotates and retries once when the wallet answers 401", async () => {
    const { flows, ops, activeMandate } = setup();
    const id = await activeMandate();
    ops.createOutgoingPayment.mockRejectedValueOnce(
      new OpenPaymentsClientError("Unauthorized", {
        description: "invalid token",
        status: 401,
      }),
    );

    const payment = await flows.chargeMandate(id, {
      receiver: BOB,
      amount: "1000",
    });

    expect(payment.status).toBe("processing");
    expect(ops.rotateToken).toHaveBeenCalledTimes(1);
    expect(ops.createOutgoingPayment).toHaveBeenCalledTimes(2);
    expect(ops.createOutgoingPayment.mock.calls[1]?.[1]).toBe("rotated-token");
  });

  it("send mode fixes the amount the sender pays", async () => {
    const { flows, ops, activeMandate } = setup();
    const id = await activeMandate();

    await flows.chargeMandate(id, {
      receiver: BOB,
      amount: "10",
      amountType: "send",
    });

    expect(ops.createIncomingPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: BOB }),
      {
        description: undefined,
      },
    );
    expect(ops.createQuote).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: ALICE }),
      {
        receiver: expect.any(String),
        debitAmount: usd("1000"),
      },
    );
  });

  it("splits between receivers and reports failures per receiver", async () => {
    const { flows, activeMandate } = setup();
    const id = await activeMandate();

    const results = await flows.splitMandate(id, {
      receivers: [
        { receiver: BOB, amount: "1000" },
        { receiver: "https://ilp.interledger-test.dev/nadie", amount: "1" },
      ],
    });

    expect(results[0]?.payment?.status).toBe("processing");
    expect(results[1]?.error).toContain("wallet desconocida");
  });

  it("refuses to charge a mandate that is not active", async () => {
    const { flows } = setup();
    const { mandate } = await flows.startMandate({
      sender: ALICE,
      maxAmount: "20",
    });

    await expect(
      flows.chargeMandate(mandate.id, { receiver: BOB, amount: "1" }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it("revokes the grant and stops charging", async () => {
    const { flows, ops, activeMandate } = setup();
    const id = await activeMandate();

    const revoked = await flows.revokeMandate(id);

    expect(ops.cancelGrant).toHaveBeenCalledWith({
      uri: `${AUTH_SERVER}/continue/1`,
      accessToken: "continue-token-2",
    });
    expect(revoked.status).toBe("revoked");
    await expect(
      flows.chargeMandate(id, { receiver: BOB, amount: "1" }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});
