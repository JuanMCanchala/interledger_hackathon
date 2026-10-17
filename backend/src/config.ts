import { existsSync } from "node:fs";
import { z } from "zod";
import { normalizeWalletAddressUrl } from "./openPayments/walletAddress.js";

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  FRONTEND_URL: z.url().optional(),
  OP_CLIENT_WALLET_ADDRESS: z
    .string()
    .min(1, "falta la wallet address de la app"),
  OP_KEY_ID: z.string().min(1, "falta el key ID de las developer keys"),
  OP_PRIVATE_KEY: z.string().optional(),
  OP_PRIVATE_KEY_PATH: z.string().default("private.key"),
  OP_ALLOWED_WALLET_HOSTS: z.string().default("ilp.interledger-test.dev"),
  OP_LOG_LEVEL: z.enum(LOG_LEVELS).default("warn"),
  // The wallet app's send screen: the sale's QR opens it with the shop as the receiver, so a
  // signed-in customer only picks their wallet. Empty to put the bare wallet address in the QR.
  OP_WALLET_SEND_URL: z
    .union([z.url(), z.literal("")])
    .default("https://wallet.interledger-test.dev/send"),
  // GlorIA, the shopkeeper's assistant (ADR 0017). Without a key she is simply off.
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-flash"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "debe ser una URL postgresql://")
    .default("postgresql://miplante:miplante@localhost:5432/miplante?schema=public"),
});

export interface Config {
  port: number;
  /** Where this server is reachable from the user's browser (used for the consent redirect). */
  publicBaseUrl: string;
  /** Where the user lands after consenting. Defaults to publicBaseUrl (the sandbox page). */
  frontendUrl: string;
  clientWalletAddress: string;
  keyId: string;
  /** Path to the key file or the PEM itself; the SDK accepts both. */
  privateKey: string;
  allowedWalletHosts: string[] | "*";
  logLevel: (typeof LOG_LEVELS)[number];
  /** Wallet app send screen that takes `merchantWA`; undefined to use the bare wallet address. */
  walletSendUrl?: string;
  /** PostgreSQL connection string (ADR 0010). */
  databaseUrl: string;
  /** GlorIA's model, an OpenAI-compatible chat API (ADR 0017); undefined when no key is set. */
  assistant?: { apiKey: string; baseUrl: string; model: string };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Configuración inválida:\n${z.prettifyError(parsed.error)}\nRevisa env.example y docs/OPEN_PAYMENTS.md`,
    );
  }
  const e = parsed.data;
  const publicBaseUrl = stripTrailingSlash(e.PUBLIC_BASE_URL);
  return {
    port: e.PORT,
    publicBaseUrl,
    frontendUrl: stripTrailingSlash(e.FRONTEND_URL ?? publicBaseUrl),
    clientWalletAddress: normalizeWalletAddressUrl(e.OP_CLIENT_WALLET_ADDRESS),
    keyId: e.OP_KEY_ID,
    privateKey: resolvePrivateKey(e.OP_PRIVATE_KEY, e.OP_PRIVATE_KEY_PATH),
    allowedWalletHosts: parseHosts(e.OP_ALLOWED_WALLET_HOSTS),
    logLevel: e.OP_LOG_LEVEL,
    walletSendUrl: e.OP_WALLET_SEND_URL || undefined,
    databaseUrl: e.DATABASE_URL,
    assistant: e.DEEPSEEK_API_KEY
      ? {
          apiKey: e.DEEPSEEK_API_KEY,
          baseUrl: stripTrailingSlash(e.DEEPSEEK_BASE_URL),
          model: e.DEEPSEEK_MODEL,
        }
      : undefined,
  };
}

/** OP_PRIVATE_KEY may hold the PEM (with literal "\n") or the PEM in base64, handy for deploys. */
function resolvePrivateKey(inline: string | undefined, path: string): string {
  if (inline) {
    return inline.includes("BEGIN")
      ? inline.replace(/\\n/g, "\n")
      : Buffer.from(inline, "base64").toString("utf8");
  }
  if (!existsSync(path)) {
    throw new Error(
      `No encontré la llave privada en "${path}". Descárgala del test wallet (Settings → Developer Keys) o define OP_PRIVATE_KEY.`,
    );
  }
  return path;
}

export function parseHosts(value: string): string[] | "*" {
  if (value.trim() === "*") return "*";
  return value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
