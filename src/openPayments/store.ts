import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { Amount } from "./amounts.js";

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
  /** one-off: single consent per payment. mandate-charge: paid under a recurring consent. */
  kind: "one-off" | "mandate-charge";
  status: PaymentStatus;
  description?: string;
  sender: string;
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

interface StoreData {
  payments: Record<string, PaymentRecord>;
  mandates: Record<string, MandateRecord>;
}

/**
 * Minimal persistence for the hackathon: JSON file (or memory only when no file is given).
 * It holds access tokens, so the file must stay out of git (see .gitignore).
 */
export class Store {
  private readonly data: StoreData;

  constructor(private readonly file?: string) {
    this.data =
      file && existsSync(file)
        ? (JSON.parse(readFileSync(file, "utf8")) as StoreData)
        : { payments: {}, mandates: {} };
  }

  getPayment(id: string): PaymentRecord | undefined {
    return this.data.payments[id];
  }

  savePayment(record: PaymentRecord): PaymentRecord {
    this.data.payments[record.id] = record;
    this.persist();
    return record;
  }

  listPayments(filter: { mandateId?: string } = {}): PaymentRecord[] {
    return Object.values(this.data.payments)
      .filter((p) => !filter.mandateId || p.mandateId === filter.mandateId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getMandate(id: string): MandateRecord | undefined {
    return this.data.mandates[id];
  }

  saveMandate(record: MandateRecord): MandateRecord {
    this.data.mandates[record.id] = record;
    this.persist();
    return record;
  }

  private persist(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
