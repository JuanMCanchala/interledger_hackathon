import { AppError } from "../shared/errors.js";

/**
 * Accepts the "$ilp.interledger-test.dev/alice" payment pointer shown in the test wallet
 * and returns the https URL the SDK needs.
 */
export function normalizeWalletAddressUrl(input: string): string {
  let candidate = input.trim();
  if (candidate.startsWith("$")) candidate = `https://${candidate.slice(1)}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new AppError(`Wallet address inválida: "${input}"`);
  }
  if (url.protocol !== "https:") {
    throw new AppError(`La wallet address debe usar https: "${input}"`);
  }
  if (url.search || url.hash) {
    throw new AppError(
      `La wallet address no puede tener query ni fragmento: "${input}"`,
    );
  }
  // Payment pointer spec: "$host" without a path points to /.well-known/pay.
  const path =
    url.pathname === "/"
      ? "/.well-known/pay"
      : url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/** Restricts which hosts the server will call, so user input can't make it fetch arbitrary URLs. */
export function assertAllowedWalletHost(
  url: string,
  allowedHosts: string[] | "*",
): void {
  if (allowedHosts === "*") return;
  const host = new URL(url).hostname.toLowerCase();
  if (!allowedHosts.includes(host)) {
    throw new AppError(
      `El host ${host} no está permitido. Hosts permitidos: ${allowedHosts.join(", ")} (OP_ALLOWED_WALLET_HOSTS)`,
    );
  }
}
