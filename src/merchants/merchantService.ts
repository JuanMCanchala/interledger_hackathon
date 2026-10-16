import { randomUUID } from "node:crypto";
import {
  percentToBps,
  validateRules,
  type RuleKind,
} from "../domain/allocation.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { toAmount } from "../shared/money.js";
import type { Store } from "../storage/store.js";
import type { MerchantRecord, MerchantRule } from "./types.js";

export interface RuleInput {
  label: string;
  kind: RuleKind;
  destination: string;
  /** Share of each sale, 0.01–50, at most two decimals. */
  sharePercent: number;
  /** Debt rules: amount owed, in the merchant's currency. */
  outstanding?: string;
}

export interface OnboardInput {
  name: string;
  wallet: string;
  /** Most the rules can debit per day, in the merchant's currency. */
  dailyCap: string;
  rules: RuleInput[];
}

/** The merchant's grant resets every day (ADR 0004). */
export const DAILY_INTERVAL = "P1D";

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
   * grant on the merchant's wallet, capped at `dailyCap` per day. Returns the wallet's consent URL.
   */
  async onboard(input: OnboardInput) {
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
      kind: rule.kind,
      destination: destinations[index]!.id,
      shareBps: percentToBps(rule.sharePercent),
      outstanding:
        rule.kind === "debt" && rule.outstanding !== undefined
          ? toAmount(rule.outstanding, asset)
          : undefined,
      repaid: { value: "0", ...asset },
    }));
    validateRules(rules, asset);
    if (rules.some((rule) => rule.destination === wallet.id)) {
      throw new AppError(
        "Una regla no puede enviar dinero a la misma wallet del negocio",
      );
    }

    const id = randomUUID();
    const { mandate, redirectUrl } = await this.flows.startMandate({
      sender: wallet.id,
      maxAmount: input.dailyCap,
      interval: DAILY_INTERVAL,
      description: `MiPlante · ${input.name}`,
      returnTo: `/merchant.html?id=${id}`,
    });
    const timestamp = this.now().toISOString();
    const merchant = this.store.saveMerchant({
      id,
      name: input.name,
      wallet: wallet.id,
      asset,
      dailyCap: mandate.maxAmount,
      rules,
      mandateId: mandate.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { merchant: this.view(merchant), redirectUrl };
  }

  require(id: string): MerchantRecord {
    const merchant = this.store.getMerchant(id);
    if (!merchant) throw new NotFoundError(`No existe el comercio ${id}`);
    return merchant;
  }

  /** Public view. The consent status comes from the merchant's mandate. */
  view(merchant: MerchantRecord) {
    return {
      id: merchant.id,
      name: merchant.name,
      wallet: merchant.wallet,
      asset: merchant.asset,
      dailyCap: merchant.dailyCap,
      status: this.flows.findMandate(merchant.mandateId).status,
      rules: merchant.rules,
      createdAt: merchant.createdAt,
    };
  }
}
