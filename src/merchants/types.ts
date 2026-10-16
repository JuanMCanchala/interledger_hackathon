import type { AllocationRule } from "../domain/allocation.js";
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
