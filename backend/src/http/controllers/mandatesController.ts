import { Router, type Request } from "express";
import type { MerchantService } from "../../merchants/merchantService.js";
import { describeError } from "../../openPayments/errors.js";
import type { PaymentFlows } from "../../openPayments/flows.js";
import { NotFoundError } from "../../shared/errors.js";
import * as schemas from "../schemas.js";
import { returnPath } from "./consentReturn.js";

/**
 * Recurring or capped consents. Starting and reading one is the sandbox's; the consent callback is
 * also how a shop's monthly grant gets approved.
 */
export function mandatesController({
  flows,
  merchants,
  frontendUrl,
}: {
  flows: PaymentFlows;
  merchants: MerchantService;
  frontendUrl: string;
}): Router {
  const router = Router();

  /**
   * These routes need no session, so they must never reach a shop's grant: whoever learned its ID
   * could charge the shop's wallet up to its monthly cap, or revoke it. For them a shop's mandate
   * does not exist.
   */
  const sandboxMandate = async (req: Request<{ id: string }>) => {
    if (await merchants.usesMandate(req.params.id)) {
      throw new NotFoundError(`No existe la autorización ${req.params.id}`);
    }
    return req.params.id;
  };

  router.post("/", async (req, res) => {
    res.status(201).json(await flows.startMandate(schemas.createMandate.parse(req.body)));
  });

  router.get("/:id", async (req, res) => {
    res.json(await flows.getMandate(await sandboxMandate(req)));
  });

  /** The wallet sends its owner back here after the consent screen. */
  router.get("/:id/callback", async (req, res) => {
    const { id } = req.params;
    try {
      await flows.completeMandate(id, schemas.callbackQuery.parse(req.query));
    } catch (error) {
      console.error(`[callback] autorización ${id}: ${describeError(error)}`);
    }
    const fallback = `/?mandate=${encodeURIComponent(id)}`;
    res.redirect(
      303,
      `${frontendUrl}${await returnPath(async () => (await flows.findMandate(id)).returnTo, fallback)}`,
    );
  });

  router.post("/:id/charges", async (req, res) => {
    res
      .status(201)
      .json(await flows.chargeMandate(await sandboxMandate(req), schemas.chargeMandate.parse(req.body)));
  });

  router.post("/:id/split", async (req, res) => {
    res
      .status(201)
      .json(await flows.splitMandate(await sandboxMandate(req), schemas.splitMandate.parse(req.body)));
  });

  router.delete("/:id", async (req, res) => {
    res.json(await flows.revokeMandate(await sandboxMandate(req)));
  });

  return router;
}
