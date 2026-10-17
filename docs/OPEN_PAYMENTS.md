# Open Payments integration guide

How MiPlante uses Open Payments, how to set up the Interledger test wallet, and how to run the flows
end to end. Architecture context: [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md) §7.

## What the integration covers

| Flow                                      | What it is for                                                                                                 | Open Payments steps                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **One-off payment**                       | A customer paying a sale, with consent at that moment                                                          | incoming payment → quote → interactive grant → outgoing payment → completion                                 |
| **Mandate** (recurring or capped consent) | The merchant approves once a debit cap, here per day, and MiPlante pays the rules' shares without asking again | interactive grant with `limits.debitAmount` + `limits.interval` → many outgoing payments with the same token |
| **Split charges**                         | Several payments to different wallets under one mandate                                                        | sequential outgoing payments against the same cap                                                            |

The layer also handles:

- interaction hash verification (GNAP);
- quoting again when a quote expires during consent;
- token rotation;
- revocation;
- reading the grant's spent amount;
- a host allow list for wallet addresses.

## 1. Set up the test wallet (once) — Configuración por Equipo (5 Personas / 6 Wallets)

> 📄 **Guía detallada en español para los 5 integrantes del equipo:** ver [`docs/TEAM_WALLETS.md`](TEAM_WALLETS.md).

1. Sign up at <https://wallet.interledger-test.dev>. The KYC data can be fake, but use a real email.
2. Create the accounts and wallet addresses the demo needs across the 5 team members, and deposit test money:

   | Integrante | Rol en la Demo | Moneda | Wallet Address (`$` / `https://`) |
   | :--- | :--- | :---: | :--- |
   | **Persona 1** | 🏪 Tendero (Caja Principal + Developer Key) | `COP` | `$ilp.interledger-test.dev/tienda-billeticos` |
   | **Persona 1** | 🐷 Tendero (Ahorro Emergencia) | `COP` | `$ilp.interledger-test.dev/ahorro-billeticos` |
   | **Persona 2** | 🙋‍♂️ Cliente Local (COP / Efectivo) | `COP` | `$ilp.interledger-test.dev/cliente-one` |
   | **Persona 3** | 🌎 Cliente Extranjero (Multidivisa USD) | `USD` | `$ilp.interledger-test.dev/extranjero-billeticos` |
   | **Persona 4** | 🚚 Proveedor de Mercancía | `COP` | `$ilp.interledger-test.dev/proveedor-billeticos` |
   | **Persona 5** | 🛡️ Fondo Microcrédito Anti-Gota | `COP` | `$ilp.interledger-test.dev/microcredito` |

   *(Total: **6 Wallet Addresses** repartidas entre los 5 integrantes. En Open Payments **no** necesitan generar 5 llaves privadas distintas: basta con generar 1 par de Developer Keys en la cuenta principal `tienda-billeticos` que actúa como cliente de la API).*

3. On the main app wallet (`tienda-billeticos`): **Settings → Developer Keys → Generate**. Save
   `private.key` in `backend/` for local runs and in the repository root for Docker Compose (both
   are git-ignored), and copy the **Key ID**.

## 2. Configure and check

```bash
npm --prefix backend install
cp env.example backend/.env   # set OP_CLIENT_WALLET_ADDRESS and OP_KEY_ID
npm run check:wallet -- '$ilp.interledger-test.dev/tienda-billeticos' '$ilp.interledger-test.dev/cliente-one' '$ilp.interledger-test.dev/extranjero-billeticos'
```

`check:wallet` confirms that each wallet address exists, prints its currency, and verifies that the
key and key ID are registered by requesting a grant.

| Variable                   | Default                    | Meaning                                                         |
| -------------------------- | -------------------------- | --------------------------------------------------------------- |
| `OP_CLIENT_WALLET_ADDRESS` | —                          | MiPlante's wallet address (`$…` or `https://…`)                 |
| `OP_KEY_ID`                | —                          | Key ID of the developer key                                     |
| `OP_PRIVATE_KEY_PATH`      | `private.key`              | Path to the Ed25519 private key                                 |
| `OP_PRIVATE_KEY`           | —                          | Alternative for deployments: the PEM, or the PEM in base64      |
| `PUBLIC_BASE_URL`          | `http://localhost:3000`    | Where browsers reach this server (consent callbacks)            |
| `FRONTEND_URL`             | `PUBLIC_BASE_URL`          | Where browsers land after consent, if the client runs elsewhere |
| `OP_ALLOWED_WALLET_HOSTS`  | `ilp.interledger-test.dev` | Comma-separated hosts the server may call (`*` for any)         |
| `OP_LOG_LEVEL`             | `warn`                     | SDK log level                                                   |
| `DATABASE_URL`             | local Docker PostgreSQL    | PostgreSQL connection string (holds tokens; never expose it)    |

## 3. Run the flows

```bash
npm run db:up && npm run db:deploy   # PostgreSQL in Docker, with the migrations applied
npm run dev                          # http://localhost:3000
npm run demo:merchant                # optional: the demo shop with the team's wallets
```

- **MiPlante:** register the merchant at `/onboard` and approve the daily cap in the wallet.
  From the till (`/merchant?id=…`), create a sale, open its QR link (`/pay?sale=…`) on a
  phone, pay from the customer's wallet, and watch the sale split itself. **Editar repartos**
  changes the shares and destinations for the next sales, with no new consent: the grant only
  caps the daily total (ADR 0004).
- **Sandbox:** `/sandbox` runs the raw flows (one-off payment, mandate, charges) and shows the
  four required demo steps.

The consent callback returns to the user's browser. When the phone is not on the same network as the
laptop, expose the server through a tunnel (`cloudflared tunnel --url http://localhost:3000` or
`ngrok http 3000`), set `PUBLIC_BASE_URL` to the tunnel URL and restart.

## Implementation notes

| Topic                 | What to know                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet address format | The SDK needs `https://…`; the `$…` form shown by the wallet is converted automatically.                                                                                                                                                                       |
| Interaction hash      | The test wallet's auth server (Rafiki) computes SHA-256 over `clientNonce\ninteractNonce\ninteract_ref\n<authServer>` and sends **padded** base64; we also accept unpadded. `<authServer>` is the wallet address's `authServer`, which includes the tenant ID. |
| Rejected consent      | The wallet redirects with `result=grant_rejected`; the payment or mandate is marked `rejected`.                                                                                                                                                                |
| Quotes expire         | If the customer takes long to approve, we quote again and continue only if the new cost is within the approved limit.                                                                                                                                          |
| Tokens expire         | Grant tokens are rotated before `expires_in` and once more on a 401.                                                                                                                                                                                           |
| Daily cap             | `limits.interval = R/<onboarding time>/P1D`: the cap resets every 24 hours from onboarding, and the wallet rejects debits beyond it.                                                                                                                           |
| No webhooks           | Open Payments has no webhooks for client apps; we poll incoming payments (ADR 0006).                                                                                                                                                                           |
| Errors                | `OpenPaymentsClientError` becomes HTTP 502 with the wallet's description and status.                                                                                                                                                                           |

Code map: [`backend/src/openPayments/operations.ts`](../backend/src/openPayments/operations.ts) has
one method per Open Payments step;
[`backend/src/openPayments/flows.ts`](../backend/src/openPayments/flows.ts) composes them.
