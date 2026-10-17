/**
 * Smoke test against a running MiPlante (the dev stack, or a deploy):
 *   npm run e2e:smoke                         # against http://localhost:3001
 *   E2E_URL=https://miplante.example npm run e2e:smoke
 * It creates two throwaway accounts with random credentials (never printed) and a shop on the
 * team's test wallets, which stays waiting for consent: nothing is ever paid. It checks the pages,
 * sign-up and sign-in, that the server validates by itself, that one account cannot reach
 * another's shop, and the public sale read used by /cobro.
 */
import { randomBytes } from "node:crypto";

const BASE = (process.env.E2E_URL ?? "http://localhost:3001").replace(/\/+$/, "");
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` → ${detail}`}`);
  if (!ok) failures += 1;
}

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.headers.get("content-type")?.includes("application/json");
  return { status: res.status, body: json ? await res.json() : undefined };
}

async function account() {
  const tag = randomBytes(6).toString("hex");
  const res = await call("POST", "/api/auth/register", {
    name: `E2E ${tag}`,
    email: `e2e-${tag}@example.test`,
    password: randomBytes(18).toString("base64url"),
  });
  return { status: res.status, token: res.body?.token as string | undefined };
}

const SHOP = {
  name: "E2E Tienda",
  wallet: "$ilp.interledger-test.dev/tienda-billeticos",
  monthlyCap: "500000",
  rules: [
    {
      label: "Distribuidora",
      category: "Proveedores",
      kind: "debt",
      destination: "$ilp.interledger-test.dev/proveedor-billeticos",
      sharePercent: 10,
      monthlyQuota: "200000",
      dueDay: 25,
    },
    {
      label: "Fondo",
      category: "Ahorro",
      kind: "savings",
      destination: "$ilp.interledger-test.dev/ahorro-billeticos",
      sharePercent: 5,
    },
  ],
};

console.log(`MiPlante E2E smoke · ${BASE}\n`);

// Pages ------------------------------------------------------------------------------------------
const health = await call("GET", "/api/health").catch(() => ({ status: 0, body: undefined }));
check("API responde", health.status === 200, `status ${health.status}`);
if (health.status !== 200) process.exit(1);
for (const page of ["/", "/login", "/register", "/onboard", "/merchant", "/cobro", "/pay"]) {
  const res = await fetch(`${BASE}${page}`);
  const html = await res.text();
  check(`página ${page}`, res.status === 200 && /<title>/.test(html), `status ${res.status}`);
}

// Accounts ---------------------------------------------------------------------------------------
const a = await account();
const b = await account();
check("registro de dos cuentas", a.status === 201 && b.status === 201 && Boolean(a.token && b.token));
const me = await call("GET", "/api/auth/me", undefined, a.token);
check("/me sin tienda todavía", me.status === 200 && me.body.merchant === null);
check("/me sin sesión → 401", (await call("GET", "/api/auth/me")).status === 401);

// Server-side validation (R1) ---------------------------------------------------------------------
const invalid = [
  ["repartos que suman más de 99%", { ...SHOP, rules: [{ ...SHOP.rules[0], sharePercent: 80 }, { ...SHOP.rules[1], sharePercent: 20 }] }],
  ["límite menor que las cuotas", { ...SHOP, monthlyCap: "1000" }],
  ["nombre vacío", { ...SHOP, name: "" }],
  ["día de pago 31", { ...SHOP, rules: [{ ...SHOP.rules[0], dueDay: 31 }] }],
] as const;
for (const [label, body] of invalid) {
  const res = await call("POST", "/api/merchants", body, a.token);
  check(`el servidor rechaza: ${label}`, res.status === 400, `status ${res.status}`);
}

// A shop on the real test network (it stays waiting for consent) ----------------------------------
const onboarded = await call("POST", "/api/merchants", SHOP, a.token);
check(
  "configurar la tienda con billeteras reales de la red de prueba",
  onboarded.status === 201 && typeof onboarded.body.redirectUrl === "string",
  JSON.stringify(onboarded.body),
);
const shopId = onboarded.body?.merchant?.id as string;
if (shopId) {
  const dashboard = await call("GET", `/api/merchants/${shopId}`, undefined, a.token);
  check(
    "panel de la tienda (mes, metas, apartados)",
    dashboard.status === 200 && dashboard.body.month && Array.isArray(dashboard.body.payouts) && dashboard.body.rules[0].dueDay === 25,
  );

  // Another account (R2) ---------------------------------------------------------------------------
  for (const [method, path, body] of [
    ["GET", `/api/merchants/${shopId}`],
    ["PUT", `/api/merchants/${shopId}/settings`, { name: "Robada" }],
    ["POST", `/api/merchants/${shopId}/sales`, { amount: "1000" }],
    ["POST", `/api/merchants/${shopId}/payouts`, {}],
  ] as const) {
    const res = await call(method, path, body, b.token);
    check(`otra cuenta no puede: ${method} ${path.replace(shopId, ":id")}`, res.status === 404, `status ${res.status}`);
  }
  check("sin sesión no se abre la tienda", (await call("GET", `/api/merchants/${shopId}`)).status === 401);

  // Sales ------------------------------------------------------------------------------------------
  for (const amount of ["abc", "0", "999999999999999999"]) {
    const res = await call("POST", `/api/merchants/${shopId}/sales`, { amount }, a.token);
    check(`venta inválida rechazada: ${amount}`, res.status === 400, `status ${res.status}`);
  }
  const sale = await call("POST", `/api/merchants/${shopId}/sales`, { amount: "1000", description: "E2E" }, a.token);
  check("crear una venta (solicitud de pago real)", sale.status === 201 && Boolean(sale.body.payUrl), JSON.stringify(sale.body));
  if (sale.body?.sale?.id) {
    const read = await call("GET", `/api/sales/${sale.body.sale.id}`);
    check("lectura pública de la venta para /cobro", read.status === 200 && read.body.status === "open");
  }
  check("enlace de cobro dañado → 404", (await call("GET", "/api/sales/not-a-real-id")).status === 404);
  const payout = await call("POST", `/api/merchants/${shopId}/payouts`, {}, a.token);
  check("pagar sin autorización activa → 409", payout.status === 409, `status ${payout.status}`);
}

check("cerrar sesión", (await call("POST", "/api/auth/logout", {}, a.token)).status === 204);
check("la sesión cerrada ya no sirve", (await call("GET", "/api/auth/me", undefined, a.token)).status === 401);

console.log(`\n${failures === 0 ? "Todo bien" : `${failures} fallaron`}.`);
process.exit(failures === 0 ? 0 : 1);
