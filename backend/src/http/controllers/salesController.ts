import { Router } from "express";
import type { SalesService } from "../../merchants/salesService.js";
import * as schemas from "../schemas.js";

/**
 * The customer's side of a sale, with no session: reading it (the checkout and /cobro poll it, and
 * that moves it forward) and paying it through MiPlante's checkout.
 */
export function salesController({ sales }: { sales: SalesService }): Router {
  const router = Router();

  router.get("/:id", async (req, res) => {
    res.json(await sales.refresh(req.params.id));
  });

  router.post("/:id/pay", async (req, res) => {
    res.status(201).json(await sales.pay(req.params.id, schemas.paySale.parse(req.body)));
  });

  return router;
}
