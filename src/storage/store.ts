import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { MerchantRecord, SaleRecord } from "../merchants/types.js";
import type { MandateRecord, PaymentRecord } from "../openPayments/records.js";

interface StoreData {
  payments: Record<string, PaymentRecord>;
  mandates: Record<string, MandateRecord>;
  merchants: Record<string, MerchantRecord>;
  sales: Record<string, SaleRecord>;
}

const EMPTY: StoreData = {
  payments: {},
  mandates: {},
  merchants: {},
  sales: {},
};

/**
 * Minimal persistence for the hackathon (ADR 0007): records in memory, written atomically to a JSON
 * file after every change, or memory only when no file is given (tests).
 * It holds access tokens, so the file must stay out of git (see .gitignore).
 */
export class Store {
  private readonly data: StoreData;

  constructor(private readonly file?: string) {
    const saved =
      file && existsSync(file)
        ? (JSON.parse(readFileSync(file, "utf8")) as Partial<StoreData>)
        : {};
    this.data = { ...structuredClone(EMPTY), ...saved };
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

  getMerchant(id: string): MerchantRecord | undefined {
    return this.data.merchants[id];
  }

  saveMerchant(record: MerchantRecord): MerchantRecord {
    this.data.merchants[record.id] = record;
    this.persist();
    return record;
  }

  getSale(id: string): SaleRecord | undefined {
    return this.data.sales[id];
  }

  saveSale(record: SaleRecord): SaleRecord {
    this.data.sales[record.id] = record;
    this.persist();
    return record;
  }

  /** Newest first. */
  listSales(filter: { merchantId?: string } = {}): SaleRecord[] {
    return Object.values(this.data.sales)
      .filter((s) => !filter.merchantId || s.merchantId === filter.merchantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private persist(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
