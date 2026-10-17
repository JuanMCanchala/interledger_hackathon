import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type {
  MerchantRecord,
  PayoutRecord,
  SaleRecord,
  SaleStatus,
  SettlementItem,
} from "../merchants/types.js";
import type {
  Interaction,
  MandateRecord,
  PaymentRecord,
  StoredToken,
} from "../openPayments/records.js";
import type { Amount, Asset } from "../shared/money.js";
import type { SessionRecord, UserRecord } from "../auth/types.js";
import type { RuleUpdate, SalePaymentChanges, Store } from "./store.js";

const merchantInclude = { rules: { orderBy: { position: "asc" } } } as const;
const saleInclude = { items: { orderBy: { position: "asc" } } } as const;

type MerchantRow = Prisma.MerchantGetPayload<{
  include: typeof merchantInclude;
}>;
type SaleRow = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;
type MandateRow = Prisma.MandateGetPayload<object>;
type PaymentRow = Prisma.PaymentGetPayload<object>;

/** PostgreSQL through Prisma (ADR 0010). Each save writes the whole record in one transaction. */
export class PrismaStore implements Store {
  constructor(private readonly prisma: PrismaClient) {}

  static connect(databaseUrl: string): PrismaStore {
    return new PrismaStore(
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
      }),
    );
  }

  // Payments --------------------------------------------------------------------------------------

  async getPayment(id: string) {
    if (!isUuid(id)) return undefined;
    const row = await this.prisma.payment.findUnique({ where: { id } });
    return row ? toPayment(row) : undefined;
  }

  async savePayment(record: PaymentRecord) {
    const data = {
      kind: record.kind,
      status: record.status,
      description: record.description ?? null,
      returnTo: record.returnTo ?? null,
      sender: record.sender ?? null,
      receiver: record.receiver,
      mandateId: record.mandateId ?? null,
      incomingPaymentUrl: record.incomingPaymentUrl,
      quoteId: record.quoteId ?? null,
      quoteExpiresAt: record.quoteExpiresAt ?? null,
      debitAmount: json(record.debitAmount),
      receiveAmount: json(record.receiveAmount),
      receivedAmount: json(record.receivedAmount),
      outgoingPaymentUrl: record.outgoingPaymentUrl ?? null,
      authorizedAt: date(record.authorizedAt),
      error: record.error ?? null,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      interaction: json(record.interaction),
      incomingToken: record.incomingToken ?? null,
      outgoingToken: record.outgoingToken ?? null,
    };
    await this.prisma.payment.upsert({
      where: { id: record.id },
      create: { id: record.id, ...data },
      update: data,
    });
    return record;
  }

  async listPayments(filter: { mandateId?: string } = {}) {
    const rows = await this.prisma.payment.findMany({
      where: filter.mandateId ? { mandateId: filter.mandateId } : {},
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toPayment);
  }

  // Mandates --------------------------------------------------------------------------------------

  async getMandate(id: string) {
    if (!isUuid(id)) return undefined;
    const row = await this.prisma.mandate.findUnique({ where: { id } });
    return row ? toMandate(row) : undefined;
  }

  async saveMandate(record: MandateRecord) {
    const data = {
      status: record.status,
      description: record.description ?? null,
      returnTo: record.returnTo ?? null,
      sender: record.sender,
      maxAmount: record.maxAmount as unknown as Prisma.InputJsonValue,
      interval: record.interval ?? null,
      error: record.error ?? null,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      interaction: json(record.interaction),
      token: json(record.token),
      continuation: json(record.continuation),
    };
    await this.prisma.mandate.upsert({
      where: { id: record.id },
      create: { id: record.id, ...data },
      update: data,
    });
    return record;
  }

  // Merchants -------------------------------------------------------------------------------------

  async getMerchant(id: string) {
    if (!isUuid(id)) return undefined;
    const row = await this.prisma.merchant.findUnique({
      where: { id },
      include: merchantInclude,
    });
    return row ? toMerchant(row) : undefined;
  }

  async saveMerchant(record: MerchantRecord) {
    const data = merchantColumns(record);
    await this.prisma.$transaction([
      this.prisma.merchant.upsert({
        where: { id: record.id },
        create: { id: record.id, ...data },
        update: data,
      }),
      this.prisma.rule.deleteMany({ where: { merchantId: record.id } }),
      this.prisma.rule.createMany({
        data: record.rules.map((rule, position) => ({
          merchantId: record.id,
          id: rule.id,
          position,
          label: rule.label,
          category: rule.category,
          kind: rule.kind,
          destination: rule.destination,
          shareBps: rule.shareBps,
          monthlyQuota: rule.monthlyQuota
            ? BigInt(rule.monthlyQuota.value)
            : null,
          outstanding: rule.outstanding ? BigInt(rule.outstanding.value) : null,
          repaid: BigInt(rule.repaid.value),
          savingsGoal: rule.savingsGoal ? BigInt(rule.savingsGoal.value) : null,
          dueDay: rule.dueDay ?? null,
        })),
      }),
    ]);
    return record;
  }

  async updateMerchant(record: MerchantRecord) {
    const row = await this.prisma.merchant.update({
      where: { id: record.id },
      data: merchantColumns(record),
      include: merchantInclude,
    });
    return toMerchant(row);
  }

  async recordRepayment(
    merchantId: string,
    ruleId: string,
    value: string,
    updatedAt: string,
  ) {
    const delta = BigInt(value);
    // One statement, so concurrent settlements of the same merchant never lose a repayment.
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE rules
        SET repaid = repaid + ${delta},
            outstanding = CASE WHEN outstanding IS NULL THEN NULL
                               ELSE GREATEST(outstanding - ${delta}, 0) END
        WHERE merchant_id = ${merchantId}::uuid AND id = ${ruleId}::uuid`,
      this.prisma.merchant.update({
        where: { id: merchantId },
        data: { updatedAt: new Date(updatedAt) },
      }),
    ]);
  }

  async updateRules(
    merchantId: string,
    rules: RuleUpdate[],
    updatedAt: string,
  ) {
    const ids = rules.map((rule) => rule.id);
    await this.prisma.$transaction([
      this.prisma.rule.deleteMany({
        where: { merchantId, id: { notIn: ids } },
      }),
      // Move the kept rules out of the way, so reordering never trips the unique position.
      this.prisma.$executeRaw`
        UPDATE rules SET position = -1 - position WHERE merchant_id = ${merchantId}::uuid`,
      ...rules.map((rule, position) => {
        const outstanding =
          rule.outstanding === undefined
            ? undefined
            : rule.outstanding && BigInt(rule.outstanding.value);
        const fields = {
          position,
          label: rule.label,
          category: rule.category,
          kind: rule.kind,
          destination: rule.destination,
          shareBps: rule.shareBps,
          monthlyQuota: rule.monthlyQuota
            ? BigInt(rule.monthlyQuota.value)
            : null,
          savingsGoal: rule.savingsGoal ? BigInt(rule.savingsGoal.value) : null,
          dueDay: rule.dueDay ?? null,
        };
        return this.prisma.rule.upsert({
          where: { merchantId_id: { merchantId, id: rule.id } },
          create: {
            merchantId,
            id: rule.id,
            ...fields,
            outstanding: outstanding ?? null,
            repaid: 0n,
          },
          // `repaid` is left alone: only recordRepayment changes it.
          update: {
            ...fields,
            ...(outstanding !== undefined && { outstanding }),
          },
        });
      }),
      this.prisma.merchant.update({
        where: { id: merchantId },
        data: { updatedAt: new Date(updatedAt) },
      }),
    ]);
  }

  // Sales -----------------------------------------------------------------------------------------

  async getSale(id: string) {
    if (!isUuid(id)) return undefined;
    const row = await this.prisma.sale.findUnique({
      where: { id },
      include: saleInclude,
    });
    return row ? toSale(row) : undefined;
  }

  async saveSale(record: SaleRecord) {
    const { settlement } = record;
    const data = {
      merchantId: record.merchantId,
      amount: BigInt(record.amount.value),
      assetCode: record.amount.assetCode,
      assetScale: record.amount.assetScale,
      description: record.description ?? null,
      status: record.status,
      customer: record.customer ?? null,
      paymentId: record.paymentId ?? null,
      error: record.error ?? null,
      settlementStatus: settlement.status,
      settlementReason: settlement.reason ?? null,
      keptAmount: settlement.kept ? BigInt(settlement.kept.value) : null,
      settledAt: date(settlement.settledAt),
      paidAt: date(record.paidAt),
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
    await this.prisma.$transaction([
      this.prisma.sale.upsert({
        where: { id: record.id },
        create: { id: record.id, ...data },
        update: data,
      }),
      this.prisma.settlementItem.deleteMany({ where: { saleId: record.id } }),
      this.prisma.settlementItem.createMany({
        data: settlement.items.map((item, position) => ({
          saleId: record.id,
          position,
          ruleId: item.ruleId,
          label: item.label,
          kind: item.kind,
          destination: item.destination,
          amount: BigInt(item.amount.value),
          status: item.status,
          capped: item.capped,
          paymentId: item.paymentId ?? null,
          error: item.error ?? null,
        })),
      }),
    ]);
    return record;
  }

  async listSales(
    filter: { merchantId?: string; createdSince?: string } = {},
  ) {
    const rows = await this.prisma.sale.findMany({
      where: {
        ...(filter.merchantId && { merchantId: filter.merchantId }),
        ...(filter.createdSince && {
          createdAt: { gte: new Date(filter.createdSince) },
        }),
      },
      include: saleInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toSale);
  }

  async transitionSale(
    saleId: string,
    from: SaleStatus[],
    changes: SalePaymentChanges,
    updatedAt: string,
  ) {
    const data: Prisma.SaleUncheckedUpdateManyInput = {
      updatedAt: new Date(updatedAt),
    };
    if ("status" in changes) data.status = changes.status;
    if ("customer" in changes) data.customer = changes.customer ?? null;
    if ("paymentId" in changes) data.paymentId = changes.paymentId ?? null;
    if ("error" in changes) data.error = changes.error ?? null;
    if ("paidAt" in changes) data.paidAt = date(changes.paidAt);
    const { count } = await this.prisma.sale.updateMany({
      where: { id: saleId, status: { in: from } },
      data,
    });
    return count === 1 ? this.getSale(saleId) : undefined;
  }

  async claimSettlement(saleId: string, updatedAt: string) {
    const { count } = await this.prisma.sale.updateMany({
      where: { id: saleId, status: "paid", settlementStatus: "pending" },
      data: { settlementStatus: "running", updatedAt: new Date(updatedAt) },
    });
    return count === 1;
  }

  // Accounts ----------------------------------------------------------------------------------

  async saveUser(record: UserRecord) {
    const data = {
      name: record.name,
      email: record.email,
      passwordHash: record.passwordHash,
      createdAt: new Date(record.createdAt),
    };
    await this.prisma.user.upsert({
      where: { id: record.id },
      create: { id: record.id, ...data },
      update: data,
    });
    return record;
  }

  async getUser(id: string) {
    if (!isUuid(id)) return undefined;
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : undefined;
  }

  async getUserByEmail(email: string) {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? toUser(row) : undefined;
  }

  async saveSession(record: SessionRecord) {
    await this.prisma.session.create({
      data: {
        token: record.token,
        userId: record.userId,
        createdAt: new Date(record.createdAt),
        expiresAt: new Date(record.expiresAt),
      },
    });
    return record;
  }

  async getSession(token: string) {
    const row = await this.prisma.session.findUnique({ where: { token } });
    return row
      ? {
          token: row.token,
          userId: row.userId,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        }
      : undefined;
  }

  async deleteSession(token: string) {
    await this.prisma.session.deleteMany({ where: { token } });
  }

  async getMerchantByOwner(ownerId: string) {
    const row = await this.prisma.merchant.findFirst({
      where: { ownerId },
      include: merchantInclude,
      orderBy: { createdAt: "desc" },
    });
    return row ? toMerchant(row) : undefined;
  }

  async listMerchants() {
    const rows = await this.prisma.merchant.findMany({ include: merchantInclude });
    return rows.map(toMerchant);
  }

  async savePayout(record: PayoutRecord) {
    const data = {
      merchantId: record.merchantId,
      ruleId: record.ruleId,
      label: record.label,
      destination: record.destination,
      amount: BigInt(record.amount.value),
      assetCode: record.amount.assetCode,
      assetScale: record.amount.assetScale,
      reason: record.reason,
      month: record.month,
      status: record.status,
      paymentId: record.paymentId ?? null,
      error: record.error ?? null,
      topUp: record.topUp ? BigInt(record.topUp.value) : null,
      resolution: record.resolution ?? null,
      resolvedAt: record.resolvedAt ? new Date(record.resolvedAt) : null,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
    await this.prisma.payout.upsert({
      where: { id: record.id },
      create: { id: record.id, ...data },
      update: data,
    });
    return record;
  }

  async listPayouts(merchantId: string) {
    const rows = await this.prisma.payout.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(
      (row): PayoutRecord => ({
        id: row.id,
        merchantId: row.merchantId,
        ruleId: row.ruleId,
        label: row.label,
        destination: row.destination,
        amount: amount(row.amount, { assetCode: row.assetCode, assetScale: row.assetScale }),
        reason: row.reason as PayoutRecord["reason"],
        month: row.month,
        status: row.status as PayoutRecord["status"],
        paymentId: opt(row.paymentId),
        error: opt(row.error),
        topUp:
          row.topUp === null
            ? undefined
            : amount(row.topUp, { assetCode: row.assetCode, assetScale: row.assetScale }),
        resolution: (row.resolution ?? undefined) as PayoutRecord["resolution"],
        resolvedAt: row.resolvedAt?.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }),
    );
  }

  async isMerchantMandate(mandateId: string) {
    if (!isUuid(mandateId)) return false;
    const count = await this.prisma.merchant.count({
      where: {
        OR: [{ mandateId }, { pendingMandateId: mandateId }, { emergencyMandateId: mandateId }],
      },
    });
    return count > 0;
  }

  async close() {
    await this.prisma.$disconnect();
  }

  /** Empties every table. Only for the integration tests' throwaway database. */
  async truncateForTests() {
    await this.prisma.$executeRawUnsafe(
      "TRUNCATE payouts, settlement_items, sales, rules, merchants, payments, mandates, sessions, users",
    );
  }
}

// Row → record ------------------------------------------------------------------------------------

function toPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    kind: row.kind as PaymentRecord["kind"],
    status: row.status as PaymentRecord["status"],
    description: opt(row.description),
    returnTo: opt(row.returnTo),
    sender: opt(row.sender),
    receiver: row.receiver,
    mandateId: opt(row.mandateId),
    incomingPaymentUrl: row.incomingPaymentUrl,
    quoteId: opt(row.quoteId),
    quoteExpiresAt: opt(row.quoteExpiresAt),
    debitAmount: fromJson<Amount>(row.debitAmount),
    receiveAmount: fromJson<Amount>(row.receiveAmount),
    receivedAmount: fromJson<Amount>(row.receivedAmount),
    outgoingPaymentUrl: opt(row.outgoingPaymentUrl),
    authorizedAt: iso(row.authorizedAt),
    error: opt(row.error),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    interaction: fromJson<Interaction>(row.interaction),
    incomingToken: opt(row.incomingToken),
    outgoingToken: opt(row.outgoingToken),
  };
}

function toMandate(row: MandateRow): MandateRecord {
  return {
    id: row.id,
    status: row.status as MandateRecord["status"],
    description: opt(row.description),
    returnTo: opt(row.returnTo),
    sender: row.sender,
    maxAmount: row.maxAmount as unknown as Amount,
    interval: opt(row.interval),
    error: opt(row.error),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    interaction: fromJson<Interaction>(row.interaction),
    token: fromJson<StoredToken>(row.token),
    continuation: fromJson<MandateRecord["continuation"]>(row.continuation),
  };
}

/** The shop's own columns; its rules are stored apart. */
function merchantColumns(record: MerchantRecord) {
  return {
    ownerId: record.ownerId ?? null,
    name: record.name,
    wallet: record.wallet,
    assetCode: record.asset.assetCode,
    assetScale: record.asset.assetScale,
    monthlyCap: BigInt(record.monthlyCap.value),
    monthlySalesGoal: record.monthlySalesGoal
      ? BigInt(record.monthlySalesGoal.value)
      : null,
    pendingCap: record.pendingCap
      ? BigInt(record.pendingCap.monthlyCap.value)
      : null,
    pendingMandateId: record.pendingCap?.mandateId ?? null,
    emergencyMandateId: record.emergency?.mandateId ?? null,
    emergencyRuleId: record.emergency?.ruleId ?? null,
    mandateId: record.mandateId,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function toMerchant(row: MerchantRow): MerchantRecord {
  const asset: Asset = { assetCode: row.assetCode, assetScale: row.assetScale };
  return {
    id: row.id,
    ownerId: opt(row.ownerId),
    name: row.name,
    wallet: row.wallet,
    asset,
    monthlyCap: amount(row.monthlyCap, asset),
    rules: row.rules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      category: rule.category,
      kind: rule.kind as MerchantRecord["rules"][number]["kind"],
      destination: rule.destination,
      shareBps: rule.shareBps,
      monthlyQuota:
        rule.monthlyQuota === null
          ? undefined
          : amount(rule.monthlyQuota, asset),
      outstanding:
        rule.outstanding === null ? undefined : amount(rule.outstanding, asset),
      repaid: amount(rule.repaid, asset),
      savingsGoal:
        rule.savingsGoal === null ? undefined : amount(rule.savingsGoal, asset),
      dueDay: opt(rule.dueDay),
    })),
    mandateId: row.mandateId,
    monthlySalesGoal:
      row.monthlySalesGoal === null
        ? undefined
        : amount(row.monthlySalesGoal, asset),
    pendingCap:
      row.pendingCap === null || row.pendingMandateId === null
        ? undefined
        : {
            mandateId: row.pendingMandateId,
            monthlyCap: amount(row.pendingCap, asset),
          },
    emergency:
      row.emergencyMandateId === null || row.emergencyRuleId === null
        ? undefined
        : { mandateId: row.emergencyMandateId, ruleId: row.emergencyRuleId },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSale(row: SaleRow): SaleRecord {
  const asset: Asset = { assetCode: row.assetCode, assetScale: row.assetScale };
  return {
    id: row.id,
    merchantId: row.merchantId,
    amount: amount(row.amount, asset),
    description: opt(row.description),
    status: row.status as SaleRecord["status"],
    customer: opt(row.customer),
    paymentId: opt(row.paymentId),
    error: opt(row.error),
    settlement: {
      status: row.settlementStatus as SaleRecord["settlement"]["status"],
      reason: opt(row.settlementReason),
      items: row.items.map(
        (item): SettlementItem => ({
          ruleId: item.ruleId,
          label: item.label,
          kind: item.kind as SettlementItem["kind"],
          destination: item.destination,
          amount: amount(item.amount, asset),
          status: item.status as SettlementItem["status"],
          capped: item.capped,
          paymentId: opt(item.paymentId),
          error: opt(item.error),
        }),
      ),
      kept: row.keptAmount === null ? undefined : amount(row.keptAmount, asset),
      settledAt: iso(row.settledAt),
    },
    paidAt: iso(row.paidAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Helpers -----------------------------------------------------------------------------------------

function amount(value: bigint, asset: Asset): Amount {
  return { value: value.toString(), ...asset };
}

function opt<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function date(value: string | undefined): Date | null {
  return value === undefined ? null : new Date(value);
}

function iso(value: Date | null): string | undefined {
  return value?.toISOString();
}

function json(value: object | undefined) {
  return value === undefined
    ? Prisma.DbNull
    : (value as unknown as Prisma.InputJsonValue);
}

function fromJson<T>(value: Prisma.JsonValue): T | undefined {
  return value === null ? undefined : (value as unknown as T);
}

function toUser(row: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * IDs are UUID columns: anything else (a mistyped link, a damaged QR) cannot exist, and PostgreSQL
 * would reject the query, so the lookup simply finds nothing and the API answers 404.
 */
function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
