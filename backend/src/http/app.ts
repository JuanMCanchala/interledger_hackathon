import express from "express";
import type { GloriaService } from "../assistant/gloriaService.js";
import type { AuthService } from "../auth/authService.js";
import type { CashService } from "../merchants/cashService.js";
import type { DashboardService } from "../merchants/dashboardService.js";
import type { MerchantService } from "../merchants/merchantService.js";
import type { PayoutService } from "../merchants/payoutService.js";
import type { SalesService } from "../merchants/salesService.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import { authController } from "./controllers/authController.js";
import { displaysController } from "./controllers/displaysController.js";
import { mandatesController } from "./controllers/mandatesController.js";
import { merchantsController } from "./controllers/merchantsController.js";
import { paymentsController } from "./controllers/paymentsController.js";
import { salesController } from "./controllers/salesController.js";
import { walletsController } from "./controllers/walletsController.js";
import { cors } from "./middleware/cors.js";
import { apiNotFound, errorHandler } from "./middleware/errors.js";

export interface AppOptions {
  auth: AuthService;
  payouts: PayoutService;
  flows: PaymentFlows;
  merchants: MerchantService;
  sales: SalesService;
  cash: CashService;
  dashboard: DashboardService;
  /** Where the browser lands after the consent screen. */
  frontendUrl: string;
  /** Origin allowed to call /api from another host (e.g. an Angular dev server). */
  corsOrigin?: string;
  /** GlorIA, when a model is configured (ADR 0017). */
  gloria?: GloriaService;
}

/**
 * The HTTP API app under /api with one controller per resource (docs/API.md).
 * Errors from any controller end in `errorHandler`.
 */
export function createApp(options: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));
  if (options.corsOrigin) app.use("/api", cors(options.corsOrigin));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/wallet-address", walletsController(options));
  app.use("/api/payments", paymentsController(options));
  app.use("/api/mandates", mandatesController(options));
  app.use("/api/auth", authController(options));
  app.use("/api/merchants", merchantsController(options));
  app.use("/api/sales", salesController(options));
  app.use("/api/displays", displaysController(options));

  app.use("/api", apiNotFound);
  app.use(errorHandler);
  return app;
}
