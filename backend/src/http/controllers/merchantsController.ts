import { Router, type Request } from "express";
import type { AuthService } from "../../auth/authService.js";
import type { DashboardService } from "../../merchants/dashboardService.js";
import type { MerchantService } from "../../merchants/merchantService.js";
import type { PayoutService } from "../../merchants/payoutService.js";
import type { SalesService } from "../../merchants/salesService.js";
import { bearerToken } from "../middleware/session.js";
import * as schemas from "../schemas.js";

/**
 * The shopkeeper's routes: setting up the shop and running it. Every one needs a session, and a
 * shop answers only to the account that registered it (anyone else gets 404).
 */
export function merchantsController({
  auth,
  merchants,
  dashboard,
  payouts,
  sales,
}: {
  auth: AuthService;
  merchants: MerchantService;
  dashboard: DashboardService;
  payouts: PayoutService;
  sales: SalesService;
}): Router {
  const router = Router();

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
