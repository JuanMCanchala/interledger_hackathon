/**
 * Checks the Open Payments setup before building on it:
 *   npm run check:wallet -- [$ilp.interledger-test.dev/otra-wallet ...]
 * 1. Loads .env and the private key.
 * 2. Reads the app's wallet address (and any others passed as arguments).
 * 3. Requests a non-interactive grant: if it works, the key ID and private key are registered correctly.
 */
import { isFinalizedGrantWithAccessToken } from "@interledger/open-payments";
import { loadConfig } from "../src/config.js";
import { createOpenPaymentsClient } from "../src/openPayments/client.js";
import { describeError } from "../src/openPayments/errors.js";
import { normalizeWalletAddressUrl } from "../src/openPayments/walletAddress.js";

try {
  process.loadEnvFile();
} catch {
  // .env is optional.
}

try {
  const config = loadConfig();
  const client = await createOpenPaymentsClient(config);
  const urls = [
    config.clientWalletAddress,
    ...process.argv.slice(2).map(normalizeWalletAddressUrl),
  ];

  for (const url of urls) {
    try {
      const wallet = await client.walletAddress.get({ url });
      console.log(
        `OK    ${wallet.id}  ${wallet.assetCode} (escala ${wallet.assetScale})  auth: ${wallet.authServer}`,
      );
    } catch (error) {
      console.error(`ERROR ${url}: ${describeError(error)}`);
      process.exitCode = 1;
    }
  }

  const appWallet = await client.walletAddress.get({
    url: config.clientWalletAddress,
  });
  const grant = await client.grant.request(
    { url: appWallet.authServer },
    {
      access_token: {
        access: [{ type: "incoming-payment", actions: ["read"] }],
      },
    },
  );
  if (!isFinalizedGrantWithAccessToken(grant))
    throw new Error("El grant de prueba quedó pendiente");
  console.log(
    "OK    Llaves válidas: el servidor de autorización aceptó la firma de la app",
  );
} catch (error) {
  console.error(`ERROR ${describeError(error)}`);
  process.exitCode = 1;
}
