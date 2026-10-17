import { AppError } from "../shared/errors.js";
import type { Amount, Asset } from "../shared/money.js";

/**
 * Revenue split rules (ADR 0004, ADR 0005). Pure functions: no I/O, no clock.
 * Money is integer minor units in BigInt; shares are integer basis points (10,000 bp = 100%).
 */

export type RuleKind = "debt" | "savings";

export interface AllocationRule {
  id: string;
  label: string;
  kind: RuleKind;
  /** Wallet address that receives this rule's share. */
  destination: string;
  /** Share of each sale in basis points: 1,500 = 15%. */
  shareBps: number;
  /**
   * Debt rules (suppliers, microcredit): what is due each calendar month. Once the month's quota
   * is paid, the rule takes nothing more until next month, so the rest of the sales is profit.
   */
  monthlyQuota?: Amount;
  /** Debt rules, optional: the whole balance still owed. Nothing is allocated once it is zero. */
  outstanding?: Amount;
}

export interface Allocation {
  ruleId: string;
  amount: Amount;
  /** The monthly cap of the shop's grant reduced this allocation (possibly to zero). */
  capped: boolean;
}

export interface AllocationPlan {
  allocations: Allocation[];
  allocated: Amount;
  /** What stays with the merchant: the sale minus every allocation. */
  kept: Amount;
}

export const BPS_PER_WHOLE = 10_000;
export const MAX_RULES = 10;
/** The merchant always keeps at least half of every sale. */
export const MAX_TOTAL_SHARE_BPS = 5_000;

/** 15 → 1,500 bp. Rejects precision finer than a basis point (0.01%). */
export function percentToBps(percent: number): number {
  const bps = Math.round(percent * 100);
  if (!Number.isFinite(percent) || Math.abs(percent * 100 - bps) > 1e-6) {
    throw new AppError(
      `El porcentaje ${percent} admite como máximo dos decimales`,
    );
  }
  return bps;
}

/** `paidDebts`: rule IDs whose debt is already fully repaid; a zero balance is fine for them. */
export function validateRules(
  rules: AllocationRule[],
  asset: Asset,
  options: { paidDebts?: ReadonlySet<string> } = {},
): void {
  if (rules.length < 1 || rules.length > MAX_RULES) {
    throw new AppError(`Configura entre 1 y ${MAX_RULES} reglas`);
  }
  let total = 0;
  for (const rule of rules) {
    if (!Number.isInteger(rule.shareBps) || rule.shareBps <= 0) {
      throw new AppError(
        `La regla "${rule.label}" necesita un porcentaje mayor que cero`,
      );
    }
    total += rule.shareBps;
    if (rule.kind === "debt") {
      if (!rule.monthlyQuota || BigInt(rule.monthlyQuota.value) <= 0n) {
        throw new AppError(
          `"${rule.label}" necesita una cuota mensual mayor que cero`,
        );
      }
      assertSameAsset(rule.monthlyQuota, asset);
      if (rule.outstanding) {
        const paid =
          options.paidDebts?.has(rule.id) && rule.outstanding.value === "0";
        if (!paid && BigInt(rule.outstanding.value) <= 0n) {
          throw new AppError(
            `La deuda "${rule.label}" necesita un saldo pendiente mayor que cero`,
          );
        }
        assertSameAsset(rule.outstanding, asset);
      }
    }
  }
  if (total > MAX_TOTAL_SHARE_BPS) {
    throw new AppError(
      `Las reglas suman ${total / 100}%; como máximo pueden tomar el 50% de cada venta`,
    );
  }
}

/**
 * Who gets what from one sale. Rules are applied in order (their priority):
 *   allocation = floor(sale × shareBps / 10,000), limited, for debts, to what is left of this
 *   month's quota (`paidThisMonth` per rule ID) and to the outstanding balance, and to what is left
 *   of the grant's monthly cap. The merchant keeps the rest, so the parts always add up to the
 *   sale; once every quota of the month is paid, the whole sale is profit.
 */
export function planAllocations(
  sale: Amount,
  rules: AllocationRule[],
  remainingCap?: Amount,
  paidThisMonth: Readonly<Record<string, Amount>> = {},
): AllocationPlan {
  if (remainingCap) assertSameAsset(remainingCap, sale);
  const saleValue = BigInt(sale.value);
  let capLeft = remainingCap ? BigInt(remainingCap.value) : undefined;
  let allocated = 0n;
  const allocations: Allocation[] = [];

  for (const rule of rules) {
    let value = (saleValue * BigInt(rule.shareBps)) / BigInt(BPS_PER_WHOLE);
    if (rule.kind === "debt") {
      if (rule.monthlyQuota) {
        assertSameAsset(rule.monthlyQuota, sale);
        const paid = paidThisMonth[rule.id];
        if (paid) assertSameAsset(paid, sale);
        const quotaLeft =
          BigInt(rule.monthlyQuota.value) - BigInt(paid?.value ?? "0");
        if (value > quotaLeft) value = quotaLeft;
      }
      if (rule.outstanding) {
        assertSameAsset(rule.outstanding, sale);
        const outstanding = BigInt(rule.outstanding.value);
        if (value > outstanding) value = outstanding;
      }
    }
    if (value <= 0n) continue;

    let capped = false;
    if (capLeft !== undefined) {
      if (value > capLeft) {
        value = capLeft;
        capped = true;
      }
      capLeft -= value;
    }
    allocated += value;
    allocations.push({
      ruleId: rule.id,
      amount: withValue(sale, value),
      capped,
    });
  }

  return {
    allocations,
    allocated: withValue(sale, allocated),
    kept: withValue(sale, saleValue - allocated),
  };
}

function withValue(asset: Asset, value: bigint): Amount {
  return {
    value: value.toString(),
    assetCode: asset.assetCode,
    assetScale: asset.assetScale,
  };
}

function assertSameAsset(amount: Asset, asset: Asset): void {
  if (
    amount.assetCode !== asset.assetCode ||
    amount.assetScale !== asset.assetScale
  ) {
    throw new AppError(
      `Todos los montos deben estar en ${asset.assetCode} (escala ${asset.assetScale})`,
    );
  }
}
