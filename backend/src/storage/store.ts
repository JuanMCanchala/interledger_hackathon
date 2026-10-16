import type {
  MerchantRecord,
  MerchantRule,
  SaleRecord,
  SaleStatus,
} from "../merchants/types.js";
import type { Amount } from "../shared/money.js";
import type { MandateRecord, PaymentRecord } from "../openPayments/records.js";

/** Customer-payment fields of a sale; changing them never touches its settlement. */
export type SalePaymentChanges = Partial<
  Pick<SaleRecord, "status" | "customer" | "paymentId" | "error" | "paidAt">
>;

/**
 * A rule as the merchant edits it. `repaid` is never written here: it only grows with repayments.
 * `outstanding`: an Amount sets it, null clears it (savings), undefined keeps the stored balance, so
 * an edit never undoes a repayment recorded meanwhile.
 */
export type RuleUpdate = Omit<MerchantRule, "repaid" | "outstanding"> & {
  outstanding?: Amount | null;
};

/**
 * Persistence port (ADR 0010). PostgreSQL through Prisma in the server (`PrismaStore`), memory in
 * tests (`MemoryStore`). Records hold access tokens, so they never leave the server as they are.
 */
export interface Store {
  getPayment(id: string): Promise<PaymentRecord | undefined>;
  savePayment(record: PaymentRecord): Promise<PaymentRecord>;
  /** Newest first. */
  listPayments(filter?: { mandateId?: string }): Promise<PaymentRecord[]>;

  getMandate(id: string): Promise<MandateRecord | undefined>;
  saveMandate(record: MandateRecord): Promise<MandateRecord>;

  getMerchant(id: string): Promise<MerchantRecord | undefined>;
  saveMerchant(record: MerchantRecord): Promise<MerchantRecord>;

  getSale(id: string): Promise<SaleRecord | undefined>;
  saveSale(record: SaleRecord): Promise<SaleRecord>;
  /** Newest first. */
  listSales(filter?: {
    merchantId?: string;
    createdSince?: string;
  }): Promise<SaleRecord[]>;

  /**
   * Applies `changes` only while the sale is still in one of the `from` statuses, in one atomic
   * step. Returns the updated sale, or undefined when another request moved it first. A slow poll
   * can therefore never overwrite a settlement that started meanwhile.
   */
  transitionSale(
    saleId: string,
    from: SaleStatus[],
    changes: SalePaymentChanges,
    updatedAt: string,
  ): Promise<SaleRecord | undefined>;

  /**
   * Marks an open sale paid by an incoming payment that reached the merchant's wallet from the QR,
   * in one atomic step. Returns false if the sale is no longer open or that incoming payment
   * already paid another sale: each incoming payment pays at most one sale.
   */
  claimIncomingPayment(
    saleId: string,
    incomingPaymentUrl: string,
    paidAt: string,
  ): Promise<boolean>;

  /**
   * Moves a paid sale's settlement from "pending" to "running" in one atomic step (ADR 0006).
   * Returns false when the sale is not paid or someone else already claimed it, so a sale is split
   * exactly once even across concurrent polls or several server instances.
   */
  claimSettlement(saleId: string, updatedAt: string): Promise<boolean>;

  /**
   * Adds a repayment to a rule atomically: `repaid += value` and, for debts,
   * `outstanding = max(outstanding - value, 0)`.
   */
  recordRepayment(
    merchantId: string,
    ruleId: string,
    value: string,
    updatedAt: string,
  ): Promise<void>;

  /**
   * Replaces the merchant's rules with `rules`, in that order, in one transaction. Rules whose ID
   * already exists keep what they have repaid; new IDs start at zero; missing IDs are removed.
   */
  updateRules(
    merchantId: string,
    rules: RuleUpdate[],
    updatedAt: string,
  ): Promise<void>;

  close(): Promise<void>;
}

/** In-memory store for tests. Copies on the way in and out, like a database would. */
export class MemoryStore implements Store {
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly mandates = new Map<string, MandateRecord>();
  private readonly merchants = new Map<string, MerchantRecord>();
  private readonly sales = new Map<string, SaleRecord>();

  async getPayment(id: string) {
    return copy(this.payments.get(id));
  }

  async savePayment(record: PaymentRecord) {
    this.payments.set(record.id, copy(record));
    return record;
  }

  async listPayments(filter: { mandateId?: string } = {}) {
    return [...this.payments.values()]
      .filter((p) => !filter.mandateId || p.mandateId === filter.mandateId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(copy);
  }

  async getMandate(id: string) {
    return copy(this.mandates.get(id));
  }

  async saveMandate(record: MandateRecord) {
    this.mandates.set(record.id, copy(record));
    return record;
  }

  async getMerchant(id: string) {
    return copy(this.merchants.get(id));
  }

  async saveMerchant(record: MerchantRecord) {
    this.merchants.set(record.id, copy(record));
    return record;
  }

  async getSale(id: string) {
    return copy(this.sales.get(id));
  }

  async saveSale(record: SaleRecord) {
    this.sales.set(record.id, copy(record));
    return record;
  }

  async listSales(
    filter: { merchantId?: string; createdSince?: string } = {},
  ) {
    return [...this.sales.values()]
      .filter((s) => !filter.merchantId || s.merchantId === filter.merchantId)
      .filter(
        (s) =>
          !filter.createdSince ||
          Date.parse(s.createdAt) >= Date.parse(filter.createdSince),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(copy);
  }

  async transitionSale(
    saleId: string,
    from: SaleStatus[],
    changes: SalePaymentChanges,
    updatedAt: string,
  ) {
    const sale = this.sales.get(saleId);
    if (!sale || !from.includes(sale.status)) return undefined;
    Object.assign(sale, changes, { updatedAt });
    return copy(sale);
  }

  async claimIncomingPayment(
    saleId: string,
    incomingPaymentUrl: string,
    paidAt: string,
  ) {
    const sale = this.sales.get(saleId);
    const taken = [...this.sales.values()].some(
      (s) => s.incomingPaymentUrl === incomingPaymentUrl,
    );
    if (!sale || taken || sale.status !== "open" || sale.paymentId) return false;
    Object.assign(sale, {
      status: "paid",
      incomingPaymentUrl,
      paidAt,
      updatedAt: paidAt,
      error: undefined,
    });
    return true;
  }

  async claimSettlement(saleId: string, updatedAt: string) {
    const sale = this.sales.get(saleId);
    if (!sale || sale.status !== "paid" || sale.settlement.status !== "pending")
      return false;
    sale.settlement.status = "running";
    sale.updatedAt = updatedAt;
    return true;
  }

  async recordRepayment(
    merchantId: string,
    ruleId: string,
    value: string,
    updatedAt: string,
  ) {
    const merchant = this.merchants.get(merchantId);
    const rule = merchant?.rules.find((r) => r.id === ruleId);
    if (!merchant || !rule) return;
    const delta = BigInt(value);
    rule.repaid = {
      ...rule.repaid,
      value: (BigInt(rule.repaid.value) + delta).toString(),
    };
    if (rule.outstanding) {
      const left = BigInt(rule.outstanding.value) - delta;
      rule.outstanding = {
        ...rule.outstanding,
        value: (left > 0n ? left : 0n).toString(),
      };
    }
    merchant.updatedAt = updatedAt;
  }

  async updateRules(
    merchantId: string,
    rules: RuleUpdate[],
    updatedAt: string,
  ) {
    const merchant = this.merchants.get(merchantId);
    if (!merchant) return;
    const previous = new Map(merchant.rules.map((rule) => [rule.id, rule]));
    merchant.rules = rules.map(({ outstanding, ...rule }) => {
      const old = previous.get(rule.id);
      return {
        ...rule,
        outstanding:
          outstanding === undefined
            ? old?.outstanding
            : (outstanding ?? undefined),
        repaid: old?.repaid ?? { value: "0", ...merchant.asset },
      };
    });
    merchant.updatedAt = updatedAt;
  }

  async close() {}
}

function copy<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}
