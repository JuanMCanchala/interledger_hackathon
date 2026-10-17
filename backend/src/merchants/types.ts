import type { AllocationRule, RuleKind } from "../domain/allocation.js";
import type { Amount, Asset } from "../shared/money.js";

export interface MerchantRule extends AllocationRule {
  /** Groups the shop's wallets on screen: "Proveedores", "Microcréditos", "Ahorro" or the shop's own. */
  category: string;
  /** Total sent to this rule so far. */
  repaid: Amount;
  /** Savings rules, optional: the amount the shop wants to reach. Shown as a goal, never a limit. */
  savingsGoal?: Amount;
  /**
   * Debt rules: the day of the month (1–28) the creditor is paid. Each sale only reserves the
   * debt's share; on this day everything reserved leaves in one payment (ADR 0014).
   */
  dueDay?: number;
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
  /**
   * A new monthly cap waiting for the merchant's approval in the wallet. The current grant keeps
   * working until then; once approved, it replaces `mandateId` and `monthlyCap`.
   */
  pendingCap?: { mandateId: string; monthlyCap: Amount };
  /**
   * The last resort when profit is not enough to pay a creditor: a second grant, on the wallet of
   * one of the shop's savings rules, to move money from it back to the shop (ADR 0016).
   */
  emergency?: { mandateId: string; ruleId: string };
  /**
   * The key of the shop's counter display (ADR 0018): a phone that opens `/cobro?pantalla=<key>`
   * keeps showing the newest sale's QR. Changing it unlinks the phones that had the old one.
   */
  displayKey?: string;
  /** Cash deposited into the wallet not yet matched to a cash sale's share (ADR 0019). */
  cashCredit?: Amount;
  createdAt: string;
  updatedAt: string;
}

/** `cancelled`: replaced by a newer sale before anyone started paying it; its QR takes no money. */
export type SaleStatus =
  "open" | "awaiting-consent" | "processing" | "paid" | "failed" | "cancelled";

/** `reserved`: a debt's share set aside in the merchant's wallet until its due day (ADR 0014). */
/**
 * `reserved`: a debt's share set aside in the merchant's wallet until its due day (ADR 0014).
 * `cash`: a share of a cash sale, still in the drawer until the shopkeeper deposits it (ADR 0019).
 */
export type SettlementItemStatus =
  "processing" | "completed" | "failed" | "skipped" | "reserved" | "cash";

/**
 * One rule's share of a sale: sent from the merchant's wallet under the monthly-capped grant
 * (savings), or reserved there until the debt's due day (ADR 0014).
 */
export interface SettlementItem {
  ruleId: string;
  label: string;
  kind: RuleKind;
  destination: string;
  amount: Amount;
  status: SettlementItemStatus;
  /** The monthly cap reduced this item (possibly to zero). */
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

/**
 * One payment to a creditor: everything reserved for a debt rule, sent in one go on its due day
 * (`due-date`) or when the merchant pays early (`manual`).
 */
export interface PayoutRecord {
  id: string;
  merchantId: string;
  ruleId: string;
  label: string;
  destination: string;
  amount: Amount;
  reason: "due-date" | "manual";
  /** Bogotá month the payout belongs to, "2026-10". */
  month: string;
  status: "processing" | "completed" | "failed";
  /**
   * Due-day payouts complete the debt's monthly quota: the part of `amount` that was not reserved
   * and came from the shop's profit (ADR 0015).
   */
  topUp?: Amount;
  paymentId?: string;
  error?: string;
  /**
   * A failed payout is never retried on its own (it may have gone through after a timeout): the
   * shopkeeper checks and either retries it or marks it paid.
   */
  resolution?: "retried" | "marked-paid";
  resolvedAt?: string;
  /**
   * The shopkeeper chose the emergency fund for this failed payout: the move of its amount from the
   * savings wallet to the shop. Once it arrives, the payout is sent again (ADR 0016).
   */
  emergencyDraw?: {
    paymentId?: string;
    amount: Amount;
    status: "processing" | "completed" | "failed";
    error?: string;
    /** Its amount was already taken off the savings rule's progress. */
    counted?: boolean;
  };
  createdAt: string;
  updatedAt: string;
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
  /** How the customer paid: by QR through Open Payments (the default), or in cash (ADR 0019). */
  method?: "qr" | "cash";
  error?: string;
  settlement: Settlement;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}
