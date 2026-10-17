import { randomUUID } from "node:crypto";
import {
  percentToBps,
  validateRules,
  type RuleKind,
} from "../domain/allocation.js";
import { startOfBogotaMonth } from "../domain/calendar.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import {
  fromMinorUnits,
  toAmount,
  type Amount,
  type Asset,
} from "../shared/money.js";
import type { RuleUpdate, Store } from "../storage/store.js";
import type { MerchantRecord, MerchantRule } from "./types.js";

export interface RuleInput {
  /** Who receives it, e.g. "Distribuidora La 14". */
  label: string;
  /** "Proveedores", "Microcréditos", "Ahorro" or a category the shop creates. */
  category: string;
  kind: RuleKind;
  destination: string;
  /** Share of each sale, 0.01–50, at most two decimals. */
  sharePercent: number;
  /** Debt rules: what is due each calendar month, in the merchant's currency. */
  monthlyQuota?: string;
  /** Debt rules, optional: the whole balance owed, e.g. a microcredit. */
  outstanding?: string;
  /** Savings rules, optional: the amount the shop wants to save. */
  savingsGoal?: string;
}

/** Editing the rules: `id` names an existing rule; without it, the rule is new. */
export interface RuleEditInput extends RuleInput {
  id?: string;
}

/** The shop's own settings; what is not sent stays as it is. `null` clears the sales goal. */
export interface ShopSettingsInput {
  name?: string;
  monthlySalesGoal?: string | null;
}

export interface OnboardInput {
  name: string;
  wallet: string;
  /** Most the rules can debit per calendar month, in the merchant's currency. */
  monthlyCap: string;
  rules: RuleInput[];
}

/** The merchant's grant resets every calendar month (ADR 0013). */
export const MONTHLY_INTERVAL = "P1M";

export class MerchantService {
  private readonly now: () => Date;

  constructor(
    private readonly flows: PaymentFlows,
    private readonly store: Store,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Registers the merchant and asks for the single consent MiPlante needs: an outgoing-payment
   * grant on the merchant's wallet, capped at `monthlyCap` per calendar month. Returns the wallet's
   * consent URL.
   */
  async onboard(input: OnboardInput, ownerId?: string) {
    const wallet = await this.flows.describeWalletAddress(input.wallet);
    const asset = {
      assetCode: wallet.assetCode,
      assetScale: wallet.assetScale,
    };
    const destinations = await Promise.all(
      input.rules.map((rule) =>
        this.flows.describeWalletAddress(rule.destination),
      ),
    );

    const rules: MerchantRule[] = input.rules.map((rule, index) => ({
      id: randomUUID(),
      label: rule.label,
      category: rule.category,
      kind: rule.kind,
      destination: destinations[index]!.id,
      shareBps: percentToBps(rule.sharePercent),
      monthlyQuota: debtAmount(rule, rule.monthlyQuota, asset),
      outstanding: debtAmount(rule, rule.outstanding, asset),
      savingsGoal: savingsGoal(rule, asset),
      repaid: { value: "0", ...asset },
    }));
    validateRules(rules, asset);
    assertCapCoversQuotas(toAmount(input.monthlyCap, asset), rules);
    if (rules.some((rule) => rule.destination === wallet.id)) {
      throw new AppError(
        "Una regla no puede enviar dinero a la misma wallet del negocio",
      );
    }

    const id = randomUUID();
    const { mandate, redirectUrl } = await this.flows.startMandate({
      sender: wallet.id,
      maxAmount: input.monthlyCap,
      interval: MONTHLY_INTERVAL,
      intervalStart: startOfBogotaMonth(this.now()),
      description: `MiPlante · ${input.name}`,
      returnTo: `/merchant?id=${id}`,
    });
    const timestamp = this.now().toISOString();
    const merchant = await this.store.saveMerchant({
      id,
      ownerId,
      name: input.name,
      wallet: wallet.id,
      asset,
      monthlyCap: mandate.maxAmount,
      rules,
      mandateId: mandate.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { merchant: await this.view(merchant), redirectUrl };
  }

  /**
   * The merchant changes how future sales split: shares, quotas, destinations, new or removed rules.
   * The wallet grant only caps the monthly total (ADR 0004), so this needs no new consent as long as
   * the quotas fit in it. Repaid amounts are kept, and a debt keeps its stored balance unless a new
   * one is given.
   */
  async updateRules(id: string, input: RuleEditInput[]) {
    const merchant = await this.require(id);
    const existing = new Map(merchant.rules.map((rule) => [rule.id, rule]));
    for (const rule of input) {
      if (rule.id && !existing.has(rule.id)) {
        throw new AppError(`El comercio no tiene la regla ${rule.id}`);
      }
    }
    const destinations = await Promise.all(
      input.map((rule) => this.flows.describeWalletAddress(rule.destination)),
    );

    const updates: RuleUpdate[] = input.map((rule, index) => {
      const old = rule.id ? existing.get(rule.id) : undefined;
      const outstanding =
        rule.kind !== "debt"
          ? null
          : rule.outstanding !== undefined
            ? toAmount(rule.outstanding, merchant.asset)
            : old?.kind === "debt"
              ? undefined // keep the stored balance, repayments may be landing right now
              : null;
      return {
        id: rule.id ?? randomUUID(),
        label: rule.label,
        category: rule.category,
        kind: rule.kind,
        destination: destinations[index]!.id,
        shareBps: percentToBps(rule.sharePercent),
        monthlyQuota: debtAmount(rule, rule.monthlyQuota, merchant.asset),
        savingsGoal: savingsGoal(rule, merchant.asset),
        outstanding,
      };
    });
    // Validate what the rules will look like once saved. A debt that was already paid off can stay.
    const paidDebts = new Set(
      updates
        .filter((rule) => rule.outstanding === undefined)
        .map((rule) => rule.id),
    );
    validateRules(
      updates.map((rule) => ({
        ...rule,
        outstanding:
          rule.outstanding === undefined
            ? existing.get(rule.id)?.outstanding
            : (rule.outstanding ?? undefined),
      })),
      merchant.asset,
      { paidDebts },
    );
    assertCapCoversQuotas(merchant.monthlyCap, updates);
    if (updates.some((rule) => rule.destination === merchant.wallet)) {
      throw new AppError(
        "Una regla no puede enviar dinero a la misma wallet del negocio",
      );
    }

    await this.store.updateRules(id, updates, this.now().toISOString());
    return this.view(await this.require(id));
  }

  /**
   * Asks the merchant for the monthly-capped consent again, with the same cap and rules, when the
   * first attempt was never approved, was rejected, or was revoked. An active consent is kept.
   */
  async renewConsent(id: string) {
    const merchant = await this.require(id);
    if (
      (await this.flows.findMandate(merchant.mandateId)).status === "active"
    ) {
      throw new AppError("Este negocio ya tiene su autorización activa", 409);
    }
    const { mandate, redirectUrl } = await this.flows.startMandate({
      sender: merchant.wallet,
      maxAmount: fromMinorUnits(
        merchant.monthlyCap.value,
        merchant.monthlyCap.assetScale,
      ),
      interval: MONTHLY_INTERVAL,
      intervalStart: startOfBogotaMonth(this.now()),
      description: `MiPlante · ${merchant.name}`,
      returnTo: `/merchant?id=${merchant.id}`,
    });
    const updated = await this.store.saveMerchant({
      ...merchant,
      mandateId: mandate.id,
      updatedAt: this.now().toISOString(),
    });
    return { merchant: await this.view(updated), redirectUrl };
  }

  /** Renames the shop or sets its monthly sales goal. Neither touches the wallet grant. */
  async updateSettings(id: string, input: ShopSettingsInput) {
    const merchant = await this.require(id);
    const goal =
      input.monthlySalesGoal === undefined
        ? merchant.monthlySalesGoal
        : input.monthlySalesGoal === null
          ? undefined
          : toAmount(input.monthlySalesGoal, merchant.asset);
    if (goal && BigInt(goal.value) <= 0n) {
      throw new AppError("La meta de ventas debe ser mayor que cero");
    }
    const updated = await this.store.saveMerchant({
      ...merchant,
      name: input.name ?? merchant.name,
      monthlySalesGoal: goal,
      updatedAt: this.now().toISOString(),
    });
    return this.view(updated);
  }

  /** The shop, only if `userId` registered it; anyone else gets a 404, as if it did not exist. */
  async requireOwned(id: string, userId: string): Promise<MerchantRecord> {
    const merchant = await this.require(id);
    if (merchant.ownerId !== userId) {
      throw new NotFoundError(`No existe el comercio ${id}`);
    }
    return merchant;
  }

  /** The shop the user registered, if any. */
  async findByOwner(userId: string) {
    const merchant = await this.store.getMerchantByOwner(userId);
    return merchant ? this.view(merchant) : null;
  }

  async require(id: string): Promise<MerchantRecord> {
    const merchant = await this.store.getMerchant(id);
    if (!merchant) throw new NotFoundError(`No existe el comercio ${id}`);
    return merchant;
  }

  /** A rule's share left the merchant's wallet: count it as repaid and lower the debt. */
  recordRepayment(
    merchantId: string,
    ruleId: string,
    amount: Amount,
  ): Promise<void> {
    return this.store.recordRepayment(
      merchantId,
      ruleId,
      amount.value,
      this.now().toISOString(),
    );
  }

  /** Public view. The consent status comes from the merchant's mandate. */
  async view(merchant: MerchantRecord) {
    const mandate = await this.flows.findMandate(merchant.mandateId);
    return {
      id: merchant.id,
      name: merchant.name,
      wallet: merchant.wallet,
      asset: merchant.asset,
      monthlyCap: merchant.monthlyCap,
      monthlySalesGoal: merchant.monthlySalesGoal ?? null,
      status: mandate.status,
      rules: merchant.rules,
      createdAt: merchant.createdAt,
    };
  }
}

/** A savings rule's goal in the shop's asset; debts have none. */
function savingsGoal(
  rule: { kind: RuleKind; savingsGoal?: string },
  asset: Asset,
): Amount | undefined {
  if (rule.kind !== "savings" || rule.savingsGoal === undefined) return undefined;
  const goal = toAmount(rule.savingsGoal, asset);
  if (BigInt(goal.value) <= 0n) {
    throw new AppError("La meta de ahorro debe ser mayor que cero");
  }
  return goal;
}

/** A debt's quota or balance in the shop's asset; savings have neither. */
function debtAmount(
  rule: { kind: RuleKind },
  decimal: string | undefined,
  asset: Asset,
): Amount | undefined {
  return rule.kind === "debt" && decimal !== undefined
    ? toAmount(decimal, asset)
    : undefined;
}

/** The monthly cap must at least pay every quota of the month; what is left is room for savings. */
function assertCapCoversQuotas(
  cap: Amount,
  rules: { monthlyQuota?: Amount }[],
): void {
  const quotas = rules.reduce(
    (total, rule) => total + BigInt(rule.monthlyQuota?.value ?? "0"),
    0n,
  );
  if (quotas > BigInt(cap.value)) {
    throw new AppError(
      `Las cuotas del mes suman ${fromMinorUnits(quotas.toString(), cap.assetScale)} ${cap.assetCode}, más que el límite mensual de ${fromMinorUnits(cap.value, cap.assetScale)} ${cap.assetCode}`,
    );
  }
}
