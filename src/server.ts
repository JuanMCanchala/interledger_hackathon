import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { MerchantService } from "./merchants/merchantService.js";
import { SalesService } from "./merchants/salesService.js";
import { createOpenPaymentsClient } from "./openPayments/client.js";
import { describeError } from "./openPayments/errors.js";
import { PaymentFlows } from "./openPayments/flows.js";
import { OpenPaymentsOperations } from "./openPayments/operations.js";
import { Store } from "./storage/store.js";

try {
  process.loadEnvFile();
} catch {
  // .env is optional: the variables may come from the environment.
}

try {
  const config = loadConfig();
  const client = await createOpenPaymentsClient(config);
  const store = new Store(config.dataFile);
  const flows = new PaymentFlows(new OpenPaymentsOperations(client), store, {
    publicBaseUrl: config.publicBaseUrl,
    allowedWalletHosts: config.allowedWalletHosts,
  });
  const merchants = new MerchantService(flows, store);
  const sales = new SalesService(flows, merchants, store, {
    frontendUrl: config.frontendUrl,
  });
  const frontendOrigin = new URL(config.frontendUrl).origin;
  const app = createApp({
    flows,
    merchants,
    sales,
    frontendUrl: config.frontendUrl,
    corsOrigin:
      frontendOrigin === new URL(config.publicBaseUrl).origin
        ? undefined
        : frontendOrigin,
  });
  app.listen(config.port, () => {
    console.log(
      `Open Payments listo en ${config.publicBaseUrl} (wallet de la app: ${config.clientWalletAddress})`,
    );
  });
} catch (error) {
  console.error(describeError(error));
  process.exit(1);
}
