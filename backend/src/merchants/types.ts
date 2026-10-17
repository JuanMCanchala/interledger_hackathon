import type { AllocationRule, RuleKind } from "../domain/allocation.js";
import type { Amount, Asset } from "../shared/money.js";

export interface MerchantRule extends AllocationRule {
  /** Groups the shop's wallets on screen: "Proveedores", "Microcréditos", "Ahorro" or the shop's own. */
  category: string;
  /** Total sent to this rule so far. */
  repaid: Amount;
  /** Savings rules, optional: the amount the shop wants to reach. Shown as a goal, never a limit. */
  savingsGoal?: Amount;
}

export interface MerchantRecord {
  id: string;
  /** The account that registered the shop; only it can open the till. */
  ownerId?: string;
  name: string;
  /** Merchant's wallet address: sales are paid into it and splits are debited from it. */
  wallet: string;
  asset: Asset;
  /**
   * Most the rules can debit per calendar month: at least the sum of the monthly quotas, plus room
   * for savings. The wallet enforces it through the grant (ADR 0004, ADR 0013).
   */
  monthlyCap: Amount;
  /** Applied in this order, which is also their priority when the monthly cap runs out. */
  rules: MerchantRule[];
  /** Open Payments mandate that holds the monthly-capped grant. */
  mandateId: string;
  /** Optional: what the shop wants to sell each calendar month. Shown as a goal. */
  monthlySalesGoal?: Amount;
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
