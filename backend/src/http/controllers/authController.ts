import { Router } from "express";
import type { AuthService } from "../../auth/authService.js";
import type { MerchantService } from "../../merchants/merchantService.js";
import { bearerToken } from "../middleware/session.js";
import * as schemas from "../schemas.js";

/** Shopkeeper accounts: sign up, sign in, sign out, and who is signed in. */
export function authController({
  auth,
  merchants,
}: {
  auth: AuthService;
  merchants: MerchantService;
}): Router {
  const router = Router();

  router.post("/register", async (req, res) => {
    res.status(201).json(await auth.register(schemas.register.parse(req.body)));
  });

  router.post("/login", async (req, res) => {
    res.json(await auth.login(schemas.login.parse(req.body)));
  });

  router.post("/logout", async (req, res) => {
    const token = bearerToken(req);
    if (token) await auth.logout(token);
    res.sendStatus(204);
  });

  /** The signed-in user and the shop they registered (null until they set it up). */
  router.get("/me", async (req, res) => {
    const user = await auth.authenticate(bearerToken(req));
    res.json({ user: auth.view(user), merchant: await merchants.findByOwner(user.id) });
  });

  return router;
}
