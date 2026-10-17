/**
 * Registers the demo shopkeeper with the team's wallets (docs/TEAM_WALLETS.md), so the demo starts
 * from the till of a shop that is already set up:
 *   npm run demo:merchant                      # against http://localhost:3000
 *   API_URL=https://mi-tunel.example npm run demo:merchant
 * It signs in as the demo shopkeeper (creating the account the first time), then prints the consent
 * link: open it once, log in as the shop's wallet and approve the monthly limit. The splits can be
 * changed later from the till ("Editar repartos") without asking for consent again.
 * DEMO_EMAIL and DEMO_PASSWORD override the demo account.
 */

const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

const ACCOUNT = {
  name: "Billeticos",
  email: process.env.DEMO_EMAIL ?? "demo@billeticos.co",
  password: process.env.DEMO_PASSWORD ?? "billeticos-demo",
};

const SHOP = {
  name: "Tienda Billeticos",
  wallet: "$ilp.interledger-test.dev/tienda-billeticos",
  // Room for both quotas (300,000 COP) plus savings.
  monthlyCap: "500000",
  rules: [
    {
      label: "Distribuidora",
      category: "Proveedores",
      kind: "debt",
      destination: "$ilp.interledger-test.dev/proveedor-billeticos",
      sharePercent: 10,
      monthlyQuota: "200000",
    },
    {
      label: "Microcrédito Anti-Gota",
      category: "Microcréditos",
      kind: "debt",
      destination: "$ilp.interledger-test.dev/microcredito",
      sharePercent: 15,
      monthlyQuota: "100000",
      outstanding: "300000",
    },
    {
      label: "Fondo de emergencia",
      category: "Ahorro",
      kind: "savings",
      destination: "$ilp.interledger-test.dev/ahorro-billeticos",
      sharePercent: 5,
    },
  ],
};

const post = (path: string, body: unknown, token?: string) =>
  fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }).catch((error: unknown) => {
    console.error(
      `No pude conectar con ${API_URL}: ¿está corriendo el backend? (${String(error)})`,
    );
    process.exit(1);
  });

// Sign in, or create the demo account the first time.
let auth = await post("/api/auth/login", ACCOUNT);
if (auth.status === 401) auth = await post("/api/auth/register", ACCOUNT);
const session = (await auth.json()) as { token?: string; error?: string };
if (!auth.ok || !session.token) {
  console.error(`No pude iniciar sesión (${auth.status}):`, session.error);
  process.exit(1);
}

const res = await post("/api/merchants", SHOP, session.token);
const body = (await res.json()) as {
  merchant?: { id: string };
  redirectUrl?: string;
  error?: string;
  details?: unknown;
};
if (!res.ok || !body.merchant || !body.redirectUrl) {
  console.error(`El backend respondió ${res.status}:`, body.error, body.details ?? "");
  process.exit(1);
}

console.log(`
${SHOP.name} registrada: 10% al proveedor hasta 200.000 COP/mes, 15% al microcrédito hasta 100.000 COP/mes
(saldo 300.000 COP), 5% al ahorro. Límite mensual: ${SHOP.monthlyCap} COP.

1. Abre este enlace, entra con la cuenta de la tienda y aprueba el límite mensual (una sola vez):
   ${body.redirectUrl}

2. La caja de la demo (inicia sesión con ${ACCOUNT.email}):
   ${API_URL}/merchant?id=${body.merchant.id}
`);
