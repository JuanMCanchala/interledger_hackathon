import {
  OpenPaymentsClientError,
  type AuthenticatedClient,
} from "@interledger/open-payments";
import { describe, expect, it, vi } from "vitest";
import { OpenPaymentsOperations } from "../src/openPayments/operations.js";

const WALLET = {
  id: "https://ilp.interledger-test.dev/tienda",
  assetCode: "COP",
  assetScale: 2,
  authServer: "https://auth.interledger-test.dev/t1",
  resourceServer: "https://ilp.interledger-test.dev",
};

function stubClient() {
  let tokens = 0;
  const client = {
    walletAddress: { get: vi.fn(async () => WALLET) },
    grant: {
      request: vi.fn(async () => ({
        access_token: {
          value: `token-${++tokens}`,
          manage: "https://auth/manage",
          expires_in: 600,
          access: [],
        },
        continue: {
          access_token: { value: "c" },
          uri: "https://auth/continue",
        },
      })),
    },
    incomingPayment: {
      create: vi.fn(async () => ({ id: "https://ilp/incoming-payments/1" })),
      get: vi.fn(async () => ({ id: "https://ilp/incoming-payments/1" })),
    },
    quote: { create: vi.fn(async () => ({ id: "https://ilp/quotes/1" })) },
  };
  return client;
}

const unauthorized = () =>
  new OpenPaymentsClientError("unauthorized", {
    description: "invalid token",
    status: 401,
  });

describe("Open Payments operations cache", () => {
  it("looks a wallet address up once, even when asked concurrently", async () => {
    const client = stubClient();
    const ops = new OpenPaymentsOperations(
      client as unknown as AuthenticatedClient,
    );

    await Promise.all([
      ops.getWalletAddress(WALLET.id),
      ops.getWalletAddress(WALLET.id),
    ]);
    await ops.getWalletAddress(WALLET.id);

    expect(client.walletAddress.get).toHaveBeenCalledTimes(1);
  });

  it("reuses a grant token for incoming payments and quotes until it nears expiry", async () => {
    const client = stubClient();
    let now = 0;
    const ops = new OpenPaymentsOperations(
      client as unknown as AuthenticatedClient,
      () => now,
    );

    await ops.createIncomingPayment(WALLET);
    await ops.createIncomingPayment(WALLET);
    await ops.createQuote(WALLET, { receiver: "https://ilp/incoming-payments/1" });
    await ops.createQuote(WALLET, { receiver: "https://ilp/incoming-payments/1" });
    // One grant per access type, not one per payment.
    expect(client.grant.request).toHaveBeenCalledTimes(2);

    now = 10 * 60_000; // past the token's lifetime minus the safety margin
    await ops.createIncomingPayment(WALLET);
    expect(client.grant.request).toHaveBeenCalledTimes(3);
  });

  it("asks for a new token once when the server refuses the cached one", async () => {
    const client = stubClient();
    const ops = new OpenPaymentsOperations(
      client as unknown as AuthenticatedClient,
    );
    await ops.createQuote(WALLET, { receiver: "https://ilp/incoming-payments/1" });
    client.quote.create.mockRejectedValueOnce(unauthorized());

    await ops.createQuote(WALLET, { receiver: "https://ilp/incoming-payments/1" });

    expect(client.grant.request).toHaveBeenCalledTimes(2);
    expect(client.quote.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessToken: "token-2" }),
      expect.anything(),
    );
  });

  it("reads an incoming payment with a new token when the stored one is inactive (403)", async () => {
    const client = stubClient();
    const ops = new OpenPaymentsOperations(
      client as unknown as AuthenticatedClient,
    );
    client.incomingPayment.get.mockRejectedValueOnce(
      new OpenPaymentsClientError("forbidden", {
        description: "Inactive Token",
        status: 403,
      }),
    );

    const { accessToken } = await ops.readIncomingPayment(
      "https://ilp/incoming-payments/1",
      WALLET,
      "stored-token",
    );

    expect(accessToken).toBe("token-1");
    expect(client.incomingPayment.get).toHaveBeenLastCalledWith({
      url: "https://ilp/incoming-payments/1",
      accessToken: "token-1",
    });
  });
});
