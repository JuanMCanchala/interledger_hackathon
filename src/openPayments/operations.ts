import {
  isFinalizedGrantWithAccessToken,
  isPendingGrant,
  type AuthenticatedClient,
  type GrantWithAccessToken,
  type IncomingPayment,
  type OutgoingPayment,
  type OutgoingPaymentGrantSpentAmounts,
  type PendingGrant,
  type Quote,
  type WalletAddress,
} from "@interledger/open-payments";
import type { Amount } from "./amounts.js";
import { AppError, isAuthError } from "./errors.js";
import type { StoredToken } from "./store.js";

export type OutgoingGrantLimits =
  | { debitAmount: Amount; interval?: string }
  | { receiveAmount: Amount; interval?: string };

export interface IncomingPaymentOptions {
  /** Fixed amount the receiver gets. Omit for an open payment request. */
  incomingAmount?: Amount;
  description?: string;
  expiresInMs?: number;
}

export interface QuoteOptions {
  /** Incoming payment URL. */
  receiver: string;
  /** Fixed amount to send. Without it, the quote uses the incoming payment's amount. */
  debitAmount?: Amount;
}

export type OutgoingPaymentOptions =
  | { quoteId: string; description?: string }
  | { incomingPayment: string; debitAmount: Amount; description?: string };

export interface Continuation {
  uri: string;
  accessToken: string;
}

/** Each Open Payments step as one call. PaymentFlows composes them; tests replace them with fakes. */
export interface PaymentOperations {
  getWalletAddress(url: string): Promise<WalletAddress>;
  createIncomingPayment(
    receiver: WalletAddress,
    options?: IncomingPaymentOptions,
  ): Promise<{ incomingPayment: IncomingPayment; accessToken: string }>;
  readIncomingPayment(
    url: string,
    receiver: WalletAddress,
    accessToken?: string,
  ): Promise<{ incomingPayment: IncomingPayment; accessToken: string }>;
  createQuote(sender: WalletAddress, options: QuoteOptions): Promise<Quote>;
  requestOutgoingPaymentGrant(
    sender: WalletAddress,
    options: {
      limits: OutgoingGrantLimits;
      finishUri: string;
      clientNonce: string;
    },
  ): Promise<PendingGrant>;
  continueGrant(
    continuation: Continuation,
    interactRef: string,
  ): Promise<GrantWithAccessToken>;
  createOutgoingPayment(
    sender: WalletAddress,
    accessToken: string,
    options: OutgoingPaymentOptions,
  ): Promise<OutgoingPayment>;
  getOutgoingPayment(
    url: string,
    accessToken: string,
  ): Promise<OutgoingPayment>;
  getGrantSpentAmounts(
    sender: WalletAddress,
    accessToken: string,
  ): Promise<OutgoingPaymentGrantSpentAmounts>;
  rotateToken(token: StoredToken): Promise<StoredToken>;
  cancelGrant(continuation: Continuation): Promise<void>;
}

const DEFAULT_INCOMING_EXPIRY_MS = 60 * 60 * 1000;

export function toStoredToken(
  token: { value: string; manage: string; expires_in?: number },
  now = new Date(),
): StoredToken {
  return {
    value: token.value,
    manage: token.manage,
    expiresAt:
      token.expires_in === undefined
        ? undefined
        : new Date(now.getTime() + token.expires_in * 1000).toISOString(),
  };
}

export class OpenPaymentsOperations implements PaymentOperations {
  constructor(private readonly client: AuthenticatedClient) {}

  /** Step 1: discover the wallet (asset, auth server, resource server). */
  getWalletAddress(url: string): Promise<WalletAddress> {
    return this.client.walletAddress.get({ url });
  }

  /** Steps 2–3: non-interactive grant on the receiver + incoming payment (the payment request). */
  async createIncomingPayment(
    receiver: WalletAddress,
    options: IncomingPaymentOptions = {},
  ): Promise<{ incomingPayment: IncomingPayment; accessToken: string }> {
    const accessToken = await this.requestIncomingPaymentToken(receiver, [
      "create",
      "read",
    ]);
    const expiresInMs = options.expiresInMs ?? DEFAULT_INCOMING_EXPIRY_MS;
    const incomingPayment = await this.client.incomingPayment.create(
      { url: receiver.resourceServer, accessToken },
      {
        walletAddress: receiver.id,
        incomingAmount: options.incomingAmount,
        expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
        metadata: options.description
          ? { description: options.description }
          : undefined,
      },
    );
    return { incomingPayment, accessToken };
  }

  /** Reads an incoming payment, requesting a fresh read grant if the stored token expired. */
  async readIncomingPayment(
    url: string,
    receiver: WalletAddress,
    accessToken?: string,
  ): Promise<{ incomingPayment: IncomingPayment; accessToken: string }> {
    if (accessToken) {
      try {
        return {
          incomingPayment: await this.client.incomingPayment.get({
            url,
            accessToken,
          }),
          accessToken,
        };
      } catch (error) {
        if (!isAuthError(error)) throw error;
      }
    }
    const freshToken = await this.requestIncomingPaymentToken(receiver, [
      "read",
    ]);
    return {
      incomingPayment: await this.client.incomingPayment.get({
        url,
        accessToken: freshToken,
      }),
      accessToken: freshToken,
    };
  }

  /** Steps 4–5: non-interactive quote grant on the sender + quote (exact cost before paying). */
  async createQuote(
    sender: WalletAddress,
    options: QuoteOptions,
  ): Promise<Quote> {
    const grant = await this.client.grant.request(
      { url: sender.authServer },
      {
        access_token: {
          access: [{ type: "quote", actions: ["create", "read"] }],
        },
      },
    );
    if (!isFinalizedGrantWithAccessToken(grant)) {
      throw new AppError(
        "El servidor de autorización pidió interacción para la cotización",
        502,
      );
    }
    const base = {
      walletAddress: sender.id,
      receiver: options.receiver,
      method: "ilp" as const,
    };
    return this.client.quote.create(
      { url: sender.resourceServer, accessToken: grant.access_token.value },
      options.debitAmount
        ? { ...base, debitAmount: options.debitAmount }
        : base,
    );
  }

  /**
   * Step 6: interactive outgoing-payment grant. The user is redirected to their wallet to consent;
   * the limits cap what the app can debit (per interval, if one is given).
   */
  async requestOutgoingPaymentGrant(
    sender: WalletAddress,
    options: {
      limits: OutgoingGrantLimits;
      finishUri: string;
      clientNonce: string;
    },
  ): Promise<PendingGrant> {
    const { limits } = options;
    const interval = limits.interval ? { interval: limits.interval } : {};
    const grant = await this.client.grant.request(
      { url: sender.authServer },
      {
        access_token: {
          access: [
            {
              type: "outgoing-payment",
              actions: ["create", "read"],
              identifier: sender.id,
              limits:
                "debitAmount" in limits
                  ? { debitAmount: limits.debitAmount, ...interval }
                  : { receiveAmount: limits.receiveAmount, ...interval },
            },
          ],
        },
        interact: {
          start: ["redirect"],
          finish: {
            method: "redirect",
            uri: options.finishUri,
            nonce: options.clientNonce,
          },
        },
      },
    );
    if (!isPendingGrant(grant)) {
      throw new AppError(
        "Se esperaba un grant interactivo pendiente para el pago saliente",
        502,
      );
    }
    return grant;
  }

  /** Step 6 (cont.): after consent, exchange `interact_ref` for the access token. */
  async continueGrant(
    continuation: Continuation,
    interactRef: string,
  ): Promise<GrantWithAccessToken> {
    const grant = await this.client.grant.continue(
      { url: continuation.uri, accessToken: continuation.accessToken },
      { interact_ref: interactRef },
    );
    if (!isFinalizedGrantWithAccessToken(grant)) {
      throw new AppError("El grant no quedó aprobado todavía", 409);
    }
    return grant;
  }

  /** Step 7: the outgoing payment debits the sender and moves the money over Interledger. */
  createOutgoingPayment(
    sender: WalletAddress,
    accessToken: string,
    options: OutgoingPaymentOptions,
  ): Promise<OutgoingPayment> {
    const metadata = options.description
      ? { description: options.description }
      : undefined;
    return this.client.outgoingPayment.create(
      { url: sender.resourceServer, accessToken },
      "quoteId" in options
        ? { walletAddress: sender.id, quoteId: options.quoteId, metadata }
        : {
            walletAddress: sender.id,
            incomingPayment: options.incomingPayment,
            debitAmount: options.debitAmount,
            metadata,
          },
    );
  }

  /** Step 8: follow the payment until it completes. */
  getOutgoingPayment(
    url: string,
    accessToken: string,
  ): Promise<OutgoingPayment> {
    return this.client.outgoingPayment.get({ url, accessToken });
  }

  /** How much of a grant's limit has been spent in the current interval. */
  getGrantSpentAmounts(
    sender: WalletAddress,
    accessToken: string,
  ): Promise<OutgoingPaymentGrantSpentAmounts> {
    return this.client.outgoingPayment.getGrantSpentAmounts({
      url: sender.resourceServer,
      accessToken,
    });
  }

  async rotateToken(token: StoredToken): Promise<StoredToken> {
    const rotated = await this.client.token.rotate({
      url: token.manage,
      accessToken: token.value,
    });
    return toStoredToken(rotated.access_token);
  }

  /** Revokes the whole grant (e.g. the user cancels a recurring consent). */
  cancelGrant(continuation: Continuation): Promise<void> {
    return this.client.grant.cancel({
      url: continuation.uri,
      accessToken: continuation.accessToken,
    });
  }

  private async requestIncomingPaymentToken(
    receiver: WalletAddress,
    actions: ("create" | "read")[],
  ): Promise<string> {
    const grant = await this.client.grant.request(
      { url: receiver.authServer },
      { access_token: { access: [{ type: "incoming-payment", actions }] } },
    );
    if (!isFinalizedGrantWithAccessToken(grant)) {
      throw new AppError(
        "El servidor de autorización pidió interacción para el pago entrante",
        502,
      );
    }
    return grant.access_token.value;
  }
}
