import { randomUUID } from "node:crypto";
import type { PaymentFlows } from "../openPayments/flows.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { fromMinorUnits, toAmount } from "../shared/money.js";
import type { Store } from "../storage/store.js";
import type { MerchantService } from "./merchantService.js";
import type { SaleRecord } from "./types.js";

type PublicPayment = ReturnType<PaymentFlows["getPayment"]>;

export interface SalesOptions {
  /** Base URL of the web client, used for the customer's pay link. */
  frontendUrl: string;
  now?: () => Date;
}

/**
 * A sale is a one-off Open Payments payment from the customer's wallet to the merchant's:
 * payment request → customer consent → execution → completion (the four steps the demo shows).
 */
export class SalesService {
  private readonly now: () => Date;

  constructor(
    private readonly flows: PaymentFlows,
    private readonly merchants: MerchantService,
    private readonly store: Store,
    private readonly options: SalesOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** The merchant types the amount; the till shows `payUrl` as a QR code. */
  createSale(
    merchantId: string,
    input: { amount: string; description?: string },
  ) {
    const merchant = this.merchants.require(merchantId);
    const timestamp = this.timestamp();
    const sale = this.store.saveSale({
      id: randomUUID(),
      merchantId,
      amount: toAmount(input.amount, merchant.asset),
      description: input.description,
      status: "open",
      settlement: { status: "pending", items: [] },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return {
      sale: this.view(sale),
      payUrl: `${this.options.frontendUrl}/pay.html?sale=${sale.id}`,
    };
  }

  /** The customer enters their wallet; returns the URL where they approve the payment. */
  async pay(saleId: string, input: { customerWallet: string }) {
    const sale = this.require(saleId);
    if (sale.status !== "open" && sale.status !== "failed") {
      throw new AppError("Esta venta ya se está pagando o ya fue pagada", 409);
    }
    const merchant = this.merchants.require(sale.merchantId);
    const { payment, redirectUrl } = await this.flows.startPayment({
      sender: input.customerWallet,
      receiver: merchant.wallet,
      amount: fromMinorUnits(sale.amount.value, sale.amount.assetScale),
      description: sale.description
        ? `${merchant.name} · ${sale.description}`
        : merchant.name,
      returnTo: `/pay.html?sale=${sale.id}`,
    });
    const updated = this.update(sale, {
      status: "awaiting-consent",
      customer: payment.sender,
      paymentId: payment.id,
      error: undefined,
    });
    return { sale: this.view(updated), redirectUrl };
  }

  /** Reads the payment's progress from Open Payments. Polled by both screens. */
  async refresh(saleId: string) {
    let sale = this.require(saleId);
    if (
      sale.paymentId &&
      (sale.status === "awaiting-consent" || sale.status === "processing")
    ) {
      const payment = await this.flows.refreshPayment(sale.paymentId);
      sale = this.update(sale, this.statusFrom(payment));
    }
    return this.view(sale);
  }

  require(id: string): SaleRecord {
    const sale = this.store.getSale(id);
    if (!sale) throw new NotFoundError(`No existe la venta ${id}`);
    return sale;
  }

  view(sale: SaleRecord) {
    const payment = sale.paymentId
      ? this.flows.getPayment(sale.paymentId)
      : undefined;
    return {
      id: sale.id,
      merchantId: sale.merchantId,
      merchantName: this.store.getMerchant(sale.merchantId)?.name,
      amount: sale.amount,
      description: sale.description,
      status: sale.status,
      customer: sale.customer,
      error: sale.error,
      payment: payment && {
        status: payment.status,
        steps: payment.steps,
        debitAmount: payment.debitAmount,
        receivedAmount: payment.receivedAmount,
      },
      settlement: sale.settlement,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      paidAt: sale.paidAt,
    };
  }

  private update(sale: SaleRecord, changes: Partial<SaleRecord>): SaleRecord {
    return this.store.saveSale({
      ...sale,
      ...changes,
      updatedAt: this.timestamp(),
    });
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private statusFrom(payment: PublicPayment): Partial<SaleRecord> {
    switch (payment.status) {
      case "completed":
        return { status: "paid", paidAt: this.timestamp(), error: undefined };
      case "failed":
      case "rejected":
        return {
          status: "failed",
          error: payment.error ?? "El pago no se completó",
        };
      case "processing":
        return { status: "processing" };
      default:
        return { status: "awaiting-consent" };
    }
  }
}
