import { DeepSeekChatModel } from "./assistant/chatModel.js";
import { GloriaService } from "./assistant/gloriaService.js";
import { AuthService } from "./auth/authService.js";
import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { CashService } from "./merchants/cashService.js";
import { DashboardService } from "./merchants/dashboardService.js";
import { MerchantService } from "./merchants/merchantService.js";
import { PayoutService } from "./merchants/payoutService.js";
import { SalesService } from "./merchants/salesService.js";
import { createOpenPaymentsClient } from "./openPayments/client.js";
import { describeError } from "./openPayments/errors.js";
import { PaymentFlows } from "./openPayments/flows.js";
import { OpenPaymentsOperations } from "./openPayments/operations.js";
import { PrismaStore } from "./storage/prismaStore.js";

try {
  process.loadEnvFile();
} catch {
  // .env is optional: the variables may come from the environment.
}

try {
  const config = loadConfig();
  const client = await createOpenPaymentsClient(config);
  const store = PrismaStore.connect(config.databaseUrl);
  const flows = new PaymentFlows(new OpenPaymentsOperations(client), store, {
    publicBaseUrl: config.publicBaseUrl,
    allowedWalletHosts: config.allowedWalletHosts,
  });
  const merchants = new MerchantService(flows, store);
  const sales = new SalesService(flows, merchants, store, {
    frontendUrl: config.frontendUrl,
    walletSendUrl: config.walletSendUrl,
  });
  const payouts = new PayoutService(flows, merchants, store);
  const cash = new CashService(flows, merchants, sales, payouts, store);
  const dashboard = new DashboardService(flows, merchants, sales, store, { payouts, cash });
  const gloria = config.assistant
    ? new GloriaService(new DeepSeekChatModel(config.assistant), dashboard)
    : undefined;
  const frontendOrigin = new URL(config.frontendUrl).origin;
  const app = createApp({
    auth: new AuthService(store),
    payouts,
    flows,
    merchants,
    sales,
    cash,
    dashboard,
    gloria,
    frontendUrl: config.frontendUrl,
    corsOrigin:
      frontendOrigin === new URL(config.publicBaseUrl).origin
        ? undefined
        : frontendOrigin,
  });
  const stopSweeper = sales.startSweeper();
  const stopPayouts = payouts.startScheduler();
  const server = app.listen(config.port, () => {
    console.log(
      `Open Payments listo en ${config.publicBaseUrl} (wallet de la app: ${config.clientWalletAddress}); GlorIA ${gloria ? `con ${config.assistant!.model}` : "apagada (sin DEEPSEEK_API_KEY)"}`,
    );
  });
  const shutdown = () => {
    stopSweeper();
    stopPayouts();
    server.close(() => void store.close().finally(() => process.exit(0)));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  console.error(describeError(error));
  process.exit(1);
}
