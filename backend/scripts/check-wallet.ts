/**
 * Checks the Open Payments setup before building on it:
 *   npm run check:wallet -- [$ilp.interledger-test.dev/otra-wallet ...]
 * 1. Loads .env and verifies the Ed25519 key pair (Private Key ↔ Public Key / JWKS kid).
 * 2. Reads the app's wallet address and the 6 official team wallets (or any passed as arguments).
 * 3. Requests a non-interactive grant, creates a test Incoming Payment on the merchant wallet,
 *    and creates real Quotes in both COP and USD to verify end-to-end Open Payments signing.
 */
import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { isFinalizedGrantWithAccessToken } from "@interledger/open-payments";
import { loadConfig } from "../src/config.js";
import { createOpenPaymentsClient } from "../src/openPayments/client.js";
import { describeError } from "../src/openPayments/errors.js";
import { OpenPaymentsOperations } from "../src/openPayments/operations.js";
import { normalizeWalletAddressUrl } from "../src/openPayments/walletAddress.js";

try {
  process.loadEnvFile();
} catch {
  // .env is optional.
}

const DEFAULT_TEAM_WALLETS = [
  "https://ilp.interledger-test.dev/tienda-billeticos",
  "https://ilp.interledger-test.dev/ahorro-billeticos",
  "https://ilp.interledger-test.dev/proveedor-billeticos",
  "https://ilp.interledger-test.dev/microcredito",
  "https://ilp.interledger-test.dev/cliente-one",
  "https://ilp.interledger-test.dev/extranjero-billeticos",
];

try {
  const config = loadConfig();

  // 1. Verify Private Key <-> Public Key match locally
  const privPem = config.privateKey.includes("BEGIN")
    ? config.privateKey
    : readFileSync(config.privateKey, "utf8");
  const derivedPubPem = createPublicKey(createPrivateKey(privPem))
    .export({ type: "spki", format: "pem" })
    .toString()
    .trim();

  if (process.env.OP_PUBLIC_KEY) {
    const expectedPubPem = process.env.OP_PUBLIC_KEY.replace(/\\n/g, "\n").trim();
    if (derivedPubPem !== expectedPubPem) {
      throw new Error(
        "La llave privada (OP_PRIVATE_KEY) NO coincide con la llave pública (OP_PUBLIC_KEY)",
      );
    }
    console.log(
      `OK    Par criptográfico Ed25519 verificado (Key ID: ${config.keyId})`,
    );
  }

  const client = await createOpenPaymentsClient(config);
  const ops = new OpenPaymentsOperations(client);

  const extraUrls =
    process.argv.slice(2).length > 0
      ? process.argv.slice(2).map(normalizeWalletAddressUrl)
      : DEFAULT_TEAM_WALLETS;
  const urls = Array.from(new Set([config.clientWalletAddress, ...extraUrls]));

  for (const url of urls) {
    try {
      const wallet = await client.walletAddress.get({ url });
      console.log(
        `OK    ${wallet.id} (${wallet.assetCode}, scale ${wallet.assetScale}) → auth: ${wallet.authServer}`,
      );
    } catch (error) {
      console.error(`FALTA ${url}: ${describeError(error)}`);
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
        access: [{ type: "incoming-payment", actions: ["read", "create"] }],
      },
    },
  );
  if (!isFinalizedGrantWithAccessToken(grant))
    throw new Error("El grant de prueba quedó pendiente");
  console.log(
    "OK    Llaves válidas: el servidor de autorización aceptó la firma HTTP Message Signature de la app",
  );

  // 4. Test real Incoming Payment + COP & USD Quotes
  const { incomingPayment } = await ops.createIncomingPayment(appWallet, {
    incomingAmount: {
      value: "1000000",
      assetCode: appWallet.assetCode,
      assetScale: appWallet.assetScale,
    },
    description: "Test de verificación MiPlante (10.000 COP)",
  });
  console.log(
    `OK    Incoming Payment creado en ${appWallet.id}: ${incomingPayment.id}`,
  );

  const copCustomer = await client.walletAddress.get({
    url: "https://ilp.interledger-test.dev/cliente-one",
  });
  const copQuote = await ops.createQuote(copCustomer, {
    receiver: incomingPayment.id,
  });
  console.log(
    `OK    Quote local (${copCustomer.assetCode} → ${appWallet.assetCode}): envía ${copQuote.debitAmount.value} (${copQuote.debitAmount.assetCode}) → recibe ${copQuote.receiveAmount.value} (${copQuote.receiveAmount.assetCode})`,
  );

  const usdCustomer = await client.walletAddress.get({
    url: "https://ilp.interledger-test.dev/extranjero-billeticos",
  });
  const usdQuote = await ops.createQuote(usdCustomer, {
    receiver: incomingPayment.id,
  });
  console.log(
    `OK    Quote multidivisa (${usdCustomer.assetCode} → ${appWallet.assetCode}): envía ${usdQuote.debitAmount.value} (${usdQuote.debitAmount.assetCode}) → recibe ${usdQuote.receiveAmount.value} (${usdQuote.receiveAmount.assetCode})`,
  );
} catch (error) {
  console.error(`ERROR ${describeError(error)}`);
  process.exit(1);
}
