import {
  mockGrant,
  mockIncomingPaymentWithPaymentMethods,
  mockOutgoingPayment,
  mockPendingGrant,
  mockQuote,
  mockWalletAddress,
  type GrantWithAccessToken,
  type WalletAddress,
} from "@interledger/open-payments";
import { vi } from "vitest";
import type { Amount } from "../src/shared/money.js";
import type {
  OutgoingPaymentOptions,
  PaymentOperations,
} from "../src/openPayments/operations.js";

export const ALICE = "https://ilp.interledger-test.dev/alice";
export const BOB = "https://ilp.interledger-test.dev/bob";
/** Destination wallets for MiPlante rules (COP). */
export const COOP = "https://ilp.interledger-test.dev/coop";
export const SAVINGS = "https://ilp.interledger-test.dev/ahorro";
export const SUPPLIER = "https://ilp.interledger-test.dev/proveedor";
export const AUTH_SERVER = "https://auth.interledger-test.dev/tenant-1";
export const NOW = new Date("2026-10-16T15:00:00Z");

const wallets: Record<string, WalletAddress> = {
  [ALICE]: mockWalletAddress({
    id: ALICE,
    assetCode: "USD",
    assetScale: 2,
    authServer: AUTH_SERVER,
    resourceServer: "https://ilp.interledger-test.dev",
  }),
  [BOB]: mockWalletAddress({
    id: BOB,
    assetCode: "COP",
    assetScale: 2,
    authServer: AUTH_SERVER,
    resourceServer: "https://ilp.interledger-test.dev",
  }),
  [COOP]: mockWalletAddress({
    id: COOP,
    assetCode: "COP",
    assetScale: 2,
    authServer: AUTH_SERVER,
    resourceServer: "https://ilp.interledger-test.dev",
  }),
  [SAVINGS]: mockWalletAddress({
    id: SAVINGS,
    assetCode: "COP",
    assetScale: 2,
    authServer: AUTH_SERVER,
    resourceServer: "https://ilp.interledger-test.dev",
  }),
  [SUPPLIER]: mockWalletAddress({
    id: SUPPLIER,
    assetCode: "COP",
    assetScale: 2,
    authServer: AUTH_SERVER,
    resourceServer: "https://ilp.interledger-test.dev",
  }),
};

const usd = (value: string): Amount => ({
  value,
  assetCode: "USD",
  assetScale: 2,
});
const cop = (value: string): Amount => ({
  value,
  assetCode: "COP",
  assetScale: 2,
});

/** In-memory stand-in for the Open Payments API with spies on every step. */
export function createFakeOperations() {
  let incomingCount = 0;
  let quoteCount = 0;
  let outgoingCount = 0;
  const incoming = new Map<string, { completed: boolean; received: Amount }>();
  /** Payments other apps made to a wallet (e.g. its provider's payment page), newest first. */
  const external = new Map<
    string,
    { url: string; createdAt: string; completed: boolean; receivedAmount: Amount }[]
  >();
  let externalCount = 0;

  const ops = {
    getWalletAddress: vi.fn(async (url: string) => {
      const wallet = wallets[url];
      if (!wallet) throw new Error(`wallet desconocida ${url}`);
      return wallet;
    }),
    createIncomingPayment: vi.fn(
      async (
        receiver: WalletAddress,
        options: { incomingAmount?: Amount } = {},
      ) => {
        const id = `${receiver.resourceServer}/incoming-payments/ip-${++incomingCount}`;
        const received = {
          value: "0",
          assetCode: receiver.assetCode,
          assetScale: receiver.assetScale,
        };
        incoming.set(id, { completed: false, received });
        return {
          incomingPayment: mockIncomingPaymentWithPaymentMethods({
            id,
            walletAddress: receiver.id,
            incomingAmount: options.incomingAmount,
            completed: false,
            receivedAmount: received,
          }),
          accessToken: "incoming-token",
        };
      },
    ),
    readIncomingPayment: vi.fn(async (url: string, receiver: WalletAddress) => {
      const state = incoming.get(url) ?? {
        completed: false,
        received: cop("0"),
      };
      return {
        incomingPayment: mockIncomingPaymentWithPaymentMethods({
          id: url,
          walletAddress: receiver.id,
          completed: state.completed,
          receivedAmount: state.received,
        }),
        accessToken: "incoming-token",
      };
    }),
    createQuote: vi.fn(
      async (
        sender: WalletAddress,
        options: { receiver: string; debitAmount?: Amount },
      ) =>
        mockQuote({
          id: `${sender.resourceServer}/quotes/q-${++quoteCount}`,
          walletAddress: sender.id,
          receiver: options.receiver,
          debitAmount: options.debitAmount ?? usd("1300"),
          receiveAmount: cop("5000000"),
          expiresAt: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
        }),
    ),
    requestOutgoingPaymentGrant: vi.fn(async () =>
      mockPendingGrant({
        interact: {
          redirect: "https://wallet.interledger-test.dev/consent/1",
          finish: "server-nonce",
        },
        continue: {
          uri: `${AUTH_SERVER}/continue/1`,
          access_token: { value: "continue-token" },
          wait: 0,
        },
      }),
    ),
    continueGrant: vi.fn(
      async () =>
        mockGrant({
          access_token: {
            value: "outgoing-token",
            manage: `${AUTH_SERVER}/token/1`,
            expires_in: 600,
            access: [],
          },
          continue: {
            uri: `${AUTH_SERVER}/continue/1`,
            access_token: { value: "continue-token-2" },
          },
        }) as GrantWithAccessToken,
    ),
    createOutgoingPayment: vi.fn(
      async (
        sender: WalletAddress,
        _accessToken: string,
        _options: OutgoingPaymentOptions,
      ) =>
        mockOutgoingPayment({
          id: `${sender.resourceServer}/outgoing-payments/op-${++outgoingCount}`,
          walletAddress: sender.id,
          failed: false,
        }),
    ),
    getOutgoingPayment: vi.fn(async (url: string) =>
      mockOutgoingPayment({ id: url, failed: false }),
    ),
    getGrantSpentAmounts: vi.fn(async () => ({
      spentDebitAmount: usd("1300"),
      spentReceiveAmount: null,
    })),
    rotateToken: vi.fn(async () => ({
      value: "rotated-token",
      manage: `${AUTH_SERVER}/token/2`,
      // Far enough that tests moving the clock forward don't expire the rotated token too.
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString(),
    })),
    cancelGrant: vi.fn(async () => {}),
    listIncomingPayments: vi.fn(async (wallet: WalletAddress) => [
      ...(external.get(wallet.id) ?? []),
    ]),
  } satisfies PaymentOperations;

  /** Simulates Interledger delivering the money to an incoming payment. */
  const deliver = (incomingPaymentUrl: string, received: Amount) => {
    incoming.set(incomingPaymentUrl, { completed: true, received });
  };

  /** Simulates a customer paying `wallet` from its provider's own page (the sale's QR). */
  const payFromProviderPage = (
    wallet: string,
    receivedAmount: Amount,
    createdAt = NOW.toISOString(),
    url = `https://ilp.interledger-test.dev/incoming-payments/provider-${++externalCount}`,
  ) => {
    external.set(wallet, [
      { url, createdAt, completed: true, receivedAmount },
      ...(external.get(wallet) ?? []),
    ]);
    return url;
  };

  return { ops, deliver, payFromProviderPage };
}
