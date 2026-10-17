import { Router, type Request } from "express";
import type { GloriaService } from "../../assistant/gloriaService.js";
import type { AuthService } from "../../auth/authService.js";
import type { DashboardService } from "../../merchants/dashboardService.js";
import type { MerchantService } from "../../merchants/merchantService.js";
import type { PayoutService } from "../../merchants/payoutService.js";
import type { SalesService } from "../../merchants/salesService.js";
import { AppError } from "../../shared/errors.js";
import { bearerToken } from "../middleware/session.js";
import * as schemas from "../schemas.js";

/**
 * The shopkeeper's routes: setting up the shop and running it. Every one needs a session, and a
 * shop answers only to the account that registered it (anyone else gets 404).
 */
/** GlorIA's answers per shop and minute: plenty for a person, a ceiling on cost and abuse. */
const GLORIA_PER_MINUTE = 20;

export function merchantsController({
  auth,
  merchants,
  dashboard,
  payouts,
  sales,
  gloria,
}: {
  auth: AuthService;
  merchants: MerchantService;
  dashboard: DashboardService;
  payouts: PayoutService;
  sales: SalesService;
  gloria?: GloriaService;
}): Router {
  const router = Router();
  const gloriaCalls = new Map<string, number[]>();

  /** The shop in the URL, only for the account that registered it. */
  const ownedMerchant = async (req: Request<{ id: string }>) => {
    const user = await auth.authenticate(bearerToken(req));
    return merchants.requireOwned(req.params.id, user.id);
  };

  router.post("/", async (req, res) => {
    const user = await auth.authenticate(bearerToken(req));
    res.status(201).json(await merchants.onboard(schemas.onboardMerchant.parse(req.body), user.id));
  });

  router.get("/:id", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.json(await dashboard.get(merchant.id));
  });

  router.put("/:id/settings", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.json(await merchants.updateSettings(merchant.id, schemas.shopSettings.parse(req.body)));
  });

  router.put("/:id/rules", async (req, res) => {
    const merchant = await ownedMerchant(req);
    const { rules } = schemas.updateRules.parse(req.body);
    res.json(await merchants.updateRules(merchant.id, rules));
  });

  /** A new monthly cap: the merchant approves it in the wallet before it replaces the current one. */
  router.post("/:id/cap", async (req, res) => {
    const merchant = await ownedMerchant(req);
    const { monthlyCap } = schemas.changeCap.parse(req.body);
    res.status(201).json(await merchants.changeCap(merchant.id, monthlyCap));
  });

  /**
   * Pays the reserved debts now: one (`ruleId`) or all. `reason: "due-date"` runs them as if their
   * due day had come, which is how the demo shows the monthly payment without waiting for it.
   */
  router.post("/:id/payouts", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.status(201).json({ payouts: await payouts.pay(merchant.id, schemas.payout.parse(req.body)) });
  });

  /** A failed payout, after the shopkeeper checked it did not arrive: send it again. */
  router.post("/:id/payouts/:payoutId/retry", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.status(201).json(await payouts.retry(merchant.id, req.params.payoutId));
  });

  /** A failed payout whose money did arrive (e.g. after a timeout): it counts as paid. */
  router.post("/:id/payouts/:payoutId/mark-paid", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.json(await payouts.markPaid(merchant.id, req.params.payoutId));
  });

  /** The second consent: a savings wallet as the last resort to pay a creditor (ADR 0016). */
  router.post("/:id/emergency", async (req, res) => {
    const merchant = await ownedMerchant(req);
    const { ruleId } = schemas.authorizeEmergency.parse(req.body);
    res.status(201).json(await merchants.authorizeEmergency(merchant.id, ruleId));
  });

  /** The last resort on a failed payout: take its amount from the emergency fund, then send it. */
  router.post("/:id/payouts/:payoutId/use-emergency", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.status(201).json(await payouts.useEmergency(merchant.id, req.params.payoutId));
  });

  /** GlorIA, the shopkeeper's assistant: answers from the shop's own data, never moves money. */
  router.post("/:id/assistant", async (req, res) => {
    const merchant = await ownedMerchant(req);
    if (!gloria) throw new AppError("GlorIA no está configurada en este servidor", 503);
    const { messages } = schemas.assistantChat.parse(req.body);
    const now = Date.now();
    const recent = (gloriaCalls.get(merchant.id) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= GLORIA_PER_MINUTE) {
      throw new AppError("Vamos muy rápido: dame un minuto y me vuelves a preguntar", 429);
    }
    gloriaCalls.set(merchant.id, [...recent, now]);
    res.json(await gloria.chat(merchant.id, messages));
  });

  /** Links a phone as the counter display, or unlinks the old one with a new key (ADR 0018). */
  router.post("/:id/display", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.status(201).json(await merchants.linkDisplay(merchant.id));
  });

  router.post("/:id/consent", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.status(201).json(await merchants.renewConsent(merchant.id));
  });

  router.post("/:id/sales", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.status(201).json(await sales.createSale(merchant.id, schemas.createSale.parse(req.body)));
  });

  return router;
}
