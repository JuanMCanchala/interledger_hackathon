import type { AllocationRule, RuleKind } from "../domain/allocation.js";
import type { Amount, Asset } from "../shared/money.js";

export interface MerchantRule extends AllocationRule {
  /** Total sent to this rule so far. */
  repaid: Amount;
}

export interface MerchantRecord {
  id: string;
  name: string;
  /** Merchant's wallet address: sales are paid into it and splits are debited from it. */
  wallet: string;
  asset: Asset;
  /** Most the rules can debit per day; the wallet enforces it through the grant (ADR 0004). */
  dailyCap: Amount;
  /** Applied in this order, which is also their priority when the daily cap runs out. */
  rules: MerchantRule[];
  /** Open Payments mandate that holds the daily-capped grant. */
  mandateId: string;
  createdAt: string;
  updatedAt: string;
}

export type SaleStatus =
  "open" | "awaiting-consent" | "processing" | "paid" | "failed";

export type SettlementItemStatus =
  "processing" | "completed" | "failed" | "skipped";

/** One rule's share of a sale, paid from the merchant's wallet under the daily-capped grant. */
export interface SettlementItem {
  ruleId: string;
  label: string;
  kind: RuleKind;
  destination: string;
  amount: Amount;
  status: SettlementItemStatus;
  /** The daily cap reduced this item (possibly to zero). */
  capped: boolean;
  paymentId?: string;
  error?: string;
}

/** pending → running → done | skipped; written before any money moves (ADR 0006). */
export interface Settlement {
  status: "pending" | "running" | "done" | "skipped";
  reason?: string;
  items: SettlementItem[];
  /** What stayed with the merchant. */
  kept?: Amount;
  settledAt?: string;
}

export interface SaleRecord {
  id: string;
  merchantId: string;
  /** In the merchant's currency. */
  amount: Amount;
  description?: string;
  status: SaleStatus;
  /** Customer's wallet address, once they start paying. */
  customer?: string;
  /** One-off Open Payments payment from the customer to the merchant. */
  paymentId?: string;
  error?: string;
  settlement: Settlement;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}
