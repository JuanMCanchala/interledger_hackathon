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

## 1. Set up the test wallet (once)

1. Sign up at <https://wallet.interledger-test.dev>. The KYC data can be fake, but use a real email.
2. Create the accounts and wallet addresses the demo needs, and deposit test money:

   | Wallet address | Currency   | Role                                                          |
   | -------------- | ---------- | ------------------------------------------------------------- |
   | `miplante-app` | any        | MiPlante's own identity: it signs every Open Payments request |
   | `tienda-rosa`  | COP        | The merchant: receives sales, pays the rules' shares          |
   | `cliente`      | COP or USD | The customer. USD shows Interledger converting currencies     |
   | `cooperativa`  | COP        | The microcredit lender                                        |
   | `ahorro-rosa`  | COP        | The merchant's emergency fund                                 |

   Each wallet address holds a single currency. The consent screens ask you to log in as the owner,
   so a second test wallet account for the customer makes the demo more realistic.

3. On `miplante-app`: **Settings → Developer Keys → Generate**. Save `private.key` in the repository
   root (it is git-ignored) and copy the **Key ID**.

## 2. Configure and check

```bash
npm install
cp env.example .env   # set OP_CLIENT_WALLET_ADDRESS and OP_KEY_ID
npm run check:wallet -- '$ilp.interledger-test.dev/tienda-rosa' '$ilp.interledger-test.dev/cliente'
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
| `DATA_FILE`                | `data/store.json`          | Local persistence (holds tokens; git-ignored)                   |

## 3. Run the flows

```bash
npm run dev   # http://localhost:3000
```

- **MiPlante:** register the merchant at `/onboard.html` and approve the daily cap in the wallet.
  From the till (`/merchant.html?id=…`), create a sale, open its QR link (`/pay.html?sale=…`) on a
  phone, pay from the customer's wallet, and watch the sale split itself.
- **Sandbox:** `/sandbox.html` runs the raw flows (one-off payment, mandate, charges) and shows the
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

Code map: [`src/openPayments/operations.ts`](../src/openPayments/operations.ts) has one method per
Open Payments step; [`src/openPayments/flows.ts`](../src/openPayments/flows.ts) composes them.
