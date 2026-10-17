import { Router } from "express";
import { describeError } from "../../openPayments/errors.js";
import type { MerchantService } from "../../merchants/merchantService.js";
import type { PaymentFlows } from "../../openPayments/flows.js";
import { NotFoundError } from "../../shared/errors.js";
import * as schemas from "../schemas.js";
import { returnPath } from "./consentReturn.js";

/** One-off Open Payments payments: the sandbox's, and the customer's checkout of a sale. */
export function paymentsController({
  flows,
  merchants,
  frontendUrl,
}: {
  flows: PaymentFlows;
  merchants: MerchantService;
  frontendUrl: string;
}): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    res.status(201).json(await flows.startPayment(schemas.createPayment.parse(req.body)));
  });

  /** A payment under a shop's grant (a split share, a payout) is the shop's business: not found. */
  router.get("/:id", async (req, res) => {
    const mandateId = await flows.paymentMandate(req.params.id);
    if (mandateId && (await merchants.usesMandate(mandateId))) {
      throw new NotFoundError(`No existe el pago ${req.params.id}`);
    }
    res.json(await flows.refreshPayment(req.params.id));
  });

  /** The wallet sends the payer back here after the consent screen. */
  router.get("/:id/callback", async (req, res) => {
    const { id } = req.params;
    try {
      await flows.completePayment(id, schemas.callbackQuery.parse(req.query));
    } catch (error) {
      // The record keeps the error; the frontend shows it when it polls.
      console.error(`[callback] pago ${id}: ${describeError(error)}`);
    }
    const fallback = `/?payment=${encodeURIComponent(id)}`;
    res.redirect(
      303,
      `${frontendUrl}${await returnPath(async () => (await flows.getPayment(id)).returnTo, fallback)}`,
    );
  });

  return router;
}
