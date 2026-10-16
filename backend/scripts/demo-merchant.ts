/**
 * Registers the demo shopkeeper with the team's wallets (docs/TEAM_WALLETS.md), so the demo starts
 * from the till of a shop that is already set up:
 *   npm run demo:merchant                      # against http://localhost:3000
 *   API_URL=https://mi-tunel.example npm run demo:merchant
 * It prints the consent link: open it once, log in as the shop and approve the daily cap. The splits
 * can be changed later from the till ("Editar repartos") without asking for consent again.
 */

const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

const SHOP = {
  name: "Tienda Billeticos",
  wallet: "$ilp.interledger-test.dev/tienda-billeticos",
  dailyCap: "50000",
  rules: [
    {
      label: "Microcrédito Anti-Gota",
      kind: "debt",
      destination: "$ilp.interledger-test.dev/microcredito",
      sharePercent: 15,
      outstanding: "300000",
    },
    {
      label: "Fondo de emergencia",
      kind: "savings",
      destination: "$ilp.interledger-test.dev/ahorro-billeticos",
      sharePercent: 5,
    },
  ],
};

const res = await fetch(`${API_URL}/api/merchants`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(SHOP),
}).catch((error: unknown) => {
  console.error(
    `No pude conectar con ${API_URL}: ¿está corriendo el backend? (${String(error)})`,
  );
  process.exit(1);
});
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
${SHOP.name} registrada: 15% al microcrédito (saldo 300.000 COP), 5% al ahorro, tope ${SHOP.dailyCap} COP/día.

1. Abre este enlace, entra con la cuenta de la tienda y aprueba el tope diario (una sola vez):
   ${body.redirectUrl}

2. La caja de la demo:
   ${API_URL}/merchant.html?id=${body.merchant.id}
`);
