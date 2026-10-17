import type { Amount } from "../shared/money.js";

/** Pending interactive grant: what we need to finish it when the user comes back. */
export interface Interaction {
  continueUri: string;
  continueToken: string;
  /** `interact.finish` returned by the auth server. */
  finishNonce: string;
  /** Nonce we generated for `interact.finish.nonce`. */
  clientNonce: string;
  /** Sender's auth server, used to verify the interaction hash. */
  authServer: string;
}

export interface StoredToken {
  value: string;
  manage: string;
  expiresAt?: string;
}

export type PaymentStatus =
  "awaiting-consent" | "processing" | "completed" | "failed" | "rejected";

export interface PaymentRecord {
  id: string;
  /**
   * one-off: single consent per payment. mandate-charge: paid under a recurring consent.
   * payment-request: an incoming payment for an exact amount that the payer pays from their own
   * wallet; MiPlante only watches it, so it has no sender, quote or outgoing payment.
   */
  kind: "one-off" | "mandate-charge" | "payment-request";
  status: PaymentStatus;
  description?: string;
  /** Page where the browser lands after the consent screen. */
  returnTo?: string;
  /** Unknown for a payment request: the payer picks their wallet in their own wallet app. */
  sender?: string;
  receiver: string;
  mandateId?: string;
  incomingPaymentUrl: string;
  quoteId?: string;
  quoteExpiresAt?: string;
  debitAmount?: Amount;
  receiveAmount?: Amount;
  receivedAmount?: Amount;
  outgoingPaymentUrl?: string;
  authorizedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  // Secrets: never returned by the API.
  interaction?: Interaction;
  incomingToken?: string;
  outgoingToken?: string;
}

export type MandateStatus =
  "awaiting-consent" | "active" | "rejected" | "revoked" | "failed";

/** Recurring consent: an outgoing-payment grant with a debit limit, optionally per interval. */
export interface MandateRecord {
  id: string;
  status: MandateStatus;
  description?: string;
  /** Page where the browser lands after the consent screen. */
  returnTo?: string;
  sender: string;
  maxAmount: Amount;
  interval?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  // Secrets: never returned by the API.
  interaction?: Interaction;
  token?: StoredToken;
  continuation?: { uri: string; accessToken: string };
}
