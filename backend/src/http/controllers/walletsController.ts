import { Router } from "express";
import type { PaymentFlows } from "../../openPayments/flows.js";
import * as schemas from "../schemas.js";

/** Looks a wallet address up (its name and currency), so forms can check it as it is typed. */
export function walletsController({ flows }: { flows: PaymentFlows }): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const { url } = schemas.walletAddressQuery.parse(req.query);
    res.json(await flows.describeWalletAddress(url));
  });

  return router;
}
