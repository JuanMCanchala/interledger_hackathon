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
  /** PostgreSQL connection string (ADR 0010). */
  databaseUrl: string;
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
    databaseUrl: e.DATABASE_URL,
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
