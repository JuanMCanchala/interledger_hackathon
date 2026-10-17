import { fileURLToPath } from "node:url";
import { OpenPaymentsClientError } from "@interledger/open-payments";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import type { AuthService } from "../auth/authService.js";
import { describeError } from "../openPayments/errors.js";
import { AppError } from "../shared/errors.js";
import type { DashboardService } from "../merchants/dashboardService.js";
import type { MerchantService } from "../merchants/merchantService.js";
import type { SalesService } from "../merchants/salesService.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import * as schemas from "./schemas.js";

export interface AppOptions {
  auth: AuthService;
  flows: PaymentFlows;
  merchants: MerchantService;
  sales: SalesService;
  dashboard: DashboardService;
  /** Where the browser lands after the consent screen. */
  frontendUrl: string;
  /** Origin allowed to call /api from another host (e.g. a Vite or Next.js dev server). */
  corsOrigin?: string;
}

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));

export function createApp({
  auth,
  flows,
  merchants,
  sales,
  dashboard,
  frontendUrl,
  corsOrigin,
}: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));
  if (corsOrigin) app.use("/api", cors(corsOrigin));
  servePagesAtCleanUrls(app);
  app.use(express.static(PUBLIC_DIR));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/wallet-address", async (req, res) => {
    const { url } = schemas.walletAddressQuery.parse(req.query);
    res.json(await flows.describeWalletAddress(url));
  });

  // One-off payment ------------------------------------------------------------------------------

  app.post("/api/payments", async (req, res) => {
    res
      .status(201)
      .json(await flows.startPayment(schemas.createPayment.parse(req.body)));
  });

  app.get("/api/payments/:id", async (req, res) => {
    res.json(await flows.refreshPayment(req.params.id));
  });

  app.get("/api/payments/:id/callback", async (req, res) => {
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

  // Mandates (recurring / capped consent) ---------------------------------------------------------

  app.post("/api/mandates", async (req, res) => {
    res
      .status(201)
      .json(await flows.startMandate(schemas.createMandate.parse(req.body)));
  });

  app.get("/api/mandates/:id", async (req, res) => {
    res.json(await flows.getMandate(req.params.id));
  });

  app.get("/api/mandates/:id/callback", async (req, res) => {
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

  app.post("/api/mandates/:id/charges", async (req, res) => {
    res
      .status(201)
      .json(
        await flows.chargeMandate(
          req.params.id,
          schemas.chargeMandate.parse(req.body),
        ),
      );
  });

  app.post("/api/mandates/:id/split", async (req, res) => {
    res
      .status(201)
      .json(
        await flows.splitMandate(
          req.params.id,
          schemas.splitMandate.parse(req.body),
        ),
      );
  });

  app.delete("/api/mandates/:id", async (req, res) => {
    res.json(await flows.revokeMandate(req.params.id));
  });

  // Accounts ---------------------------------------------------------------------------------------

  app.post("/api/auth/register", async (req, res) => {
    res.status(201).json(await auth.register(schemas.register.parse(req.body)));
  });

  app.post("/api/auth/login", async (req, res) => {
    res.json(await auth.login(schemas.login.parse(req.body)));
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = bearerToken(req);
    if (token) await auth.logout(token);
    res.sendStatus(204);
  });

  /** The signed-in user and the shop they registered (null until they set it up). */
  app.get("/api/auth/me", async (req, res) => {
    const user = await auth.authenticate(bearerToken(req));
    res.json({
      user: auth.view(user),
      merchant: await merchants.findByOwner(user.id),
    });
  });

  // MiPlante: the shopkeeper's routes need their session; the customer's do not -----------------------

  /** The shop in the URL, only for the account that registered it. */
  const ownedMerchant = async (req: Request<{ id: string }>) => {
    const user = await auth.authenticate(bearerToken(req));
    return merchants.requireOwned(req.params.id, user.id);
  };

  app.post("/api/merchants", async (req, res) => {
    const user = await auth.authenticate(bearerToken(req));
    res
      .status(201)
      .json(
        await merchants.onboard(schemas.onboardMerchant.parse(req.body), user.id),
      );
  });

  app.get("/api/merchants/:id", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.json(await dashboard.get(merchant.id));
  });

  app.put("/api/merchants/:id/settings", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.json(
      await merchants.updateSettings(
        merchant.id,
        schemas.shopSettings.parse(req.body),
      ),
    );
  });

  app.put("/api/merchants/:id/rules", async (req, res) => {
    const merchant = await ownedMerchant(req);
    const { rules } = schemas.updateRules.parse(req.body);
    res.json(await merchants.updateRules(merchant.id, rules));
  });

  /** A new monthly cap: the merchant approves it in the wallet before it replaces the current one. */
  app.post("/api/merchants/:id/cap", async (req, res) => {
    const merchant = await ownedMerchant(req);
    const { monthlyCap } = schemas.changeCap.parse(req.body);
    res.status(201).json(await merchants.changeCap(merchant.id, monthlyCap));
  });

  app.post("/api/merchants/:id/consent", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res.status(201).json(await merchants.renewConsent(merchant.id));
  });

  app.post("/api/merchants/:id/sales", async (req, res) => {
    const merchant = await ownedMerchant(req);
    res
      .status(201)
      .json(
        await sales.createSale(merchant.id, schemas.createSale.parse(req.body)),
      );
  });

  app.get("/api/sales/:id", async (req, res) => {
    res.json(await sales.refresh(req.params.id));
  });

  app.post("/api/sales/:id/pay", async (req, res) => {
    res
      .status(201)
      .json(await sales.pay(req.params.id, schemas.paySale.parse(req.body)));
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Ruta no encontrada" });
  });
  app.use(errorHandler);
  return app;
}

/** Where to send the browser after a consent callback: the record's page, or the sandbox. */
async function returnPath(
  read: () => Promise<string | undefined>,
  fallback: string,
): Promise<string> {
  try {
    return (await read()) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Pages people open from links and QR codes; each one is public/<page>.html. */
export const PAGES = [
  "login",
  "register",
  "onboard",
  "merchant",
  "pay",
  "cobro",
  "sandbox",
] as const;

/**
 * /onboard and /onboard/ serve onboard.html. The old /onboard.html links (printed QR codes, consent
 * callbacks stored before the change) redirect permanently, keeping their query string.
 */
function servePagesAtCleanUrls(app: express.Express): void {
  for (const page of PAGES) {
    app.get([`/${page}`, `/${page}/`], (_req, res) => {
      res.sendFile(`${page}.html`, { root: PUBLIC_DIR });
    });
    app.get(`/${page}.html`, (req, res) => {
      const query = req.originalUrl.indexOf("?");
      res.redirect(
        301,
        `/${page}${query === -1 ? "" : req.originalUrl.slice(query)}`,
      );
    });
  }
}

function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: "Datos inválidos",
      details: error.issues.map(
        (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`,
      ),
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof OpenPaymentsClientError) {
    res.status(502).json({
      error: "Open Payments rechazó la solicitud",
      details: describeError(error),
      upstreamStatus: error.status,
    });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "JSON inválido" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Error interno" });
}

function cors(origin: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS",
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

/** The session token from `Authorization: Bearer <token>`. */
function bearerToken(req: Request): string | undefined {
  return req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
}
