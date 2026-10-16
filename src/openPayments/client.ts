import {
  createAuthenticatedClient,
  type AuthenticatedClient,
} from "@interledger/open-payments";
import type { Config } from "../config.js";

/** The app identifies itself with its own wallet address and the developer key registered on it. */
export function createOpenPaymentsClient(
  config: Pick<
    Config,
    "clientWalletAddress" | "keyId" | "privateKey" | "logLevel"
  >,
): Promise<AuthenticatedClient> {
  return createAuthenticatedClient({
    walletAddressUrl: config.clientWalletAddress,
    keyId: config.keyId,
    privateKey: config.privateKey,
    logLevel: config.logLevel,
  });
}
