import { Router } from "express";
import { describeError } from "../../openPayments/errors.js";
import type { PaymentFlows } from "../../openPayments/flows.js";
import * as schemas from "../schemas.js";
import { returnPath } from "./consentReturn.js";

/** One-off Open Payments payments: the sandbox's, and the customer's checkout of a sale. */
export function paymentsController({
  flows,
  frontendUrl,
}: {
  flows: PaymentFlows;
  frontendUrl: string;
}): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    res.status(201).json(await flows.startPayment(schemas.createPayment.parse(req.body)));
  });

  router.get("/:id", async (req, res) => {
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
