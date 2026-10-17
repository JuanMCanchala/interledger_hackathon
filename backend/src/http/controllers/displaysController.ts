import { Router } from "express";
import type { SalesService } from "../../merchants/salesService.js";

/**
 * The counter display (ADR 0018), with no session: a phone linked to the shop by its key polls
 * here and shows the newest sale's QR, so each new sale reaches it without scanning again.
 */
export function displaysController({ sales }: { sales: SalesService }): Router {
  const router = Router();

  router.get("/:key", async (req, res) => {
    res.json(await sales.display(req.params.key));
  });

  return router;
}
