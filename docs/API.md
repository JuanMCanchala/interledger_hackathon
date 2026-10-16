# HTTP API

JSON over HTTP, served under `/api`. Amounts in requests are decimal strings in major units
(`"10000"`, `"12.50"`). Amounts in responses are Open Payments amounts in minor units:

```json
{ "value": "1000000", "assetCode": "COP", "assetScale": 2 }
```

Wallet addresses accept the payment pointer form (`$ilp.interledger-test.dev/rosa`) or `https://`.

Errors have this shape. Status codes: 400 invalid input, 404 unknown resource, 409 invalid state,
422 a charge failed, 502 the wallet rejected a request.

```json
{
  "error": "Datos inválidos",
  "details": ["amount: usa un número positivo, por ejemplo 12.50"]
}
```

## MiPlante

### `POST /api/merchants`

Registers a merchant and starts the single consent MiPlante needs.

```json
{
  "name": "Tienda Doña Rosa",
  "wallet": "$ilp.interledger-test.dev/tienda-rosa",
  "dailyCap": "30000",
  "rules": [
    {
      "label": "Microcrédito",
      "kind": "debt",
      "destination": "$ilp.interledger-test.dev/cooperativa",
      "sharePercent": 15,
      "outstanding": "300000"
    },
    {
      "label": "Fondo de emergencia",
      "kind": "savings",
      "destination": "$ilp.interledger-test.dev/ahorro-rosa",
      "sharePercent": 5
    }
  ]
}
```

- 1–5 rules, applied in order (their priority when the daily cap runs out).
- `sharePercent`: from 0.01 to 50, with at most two decimals. The rules together can take at most 50%
  of each sale.
- `outstanding` is required for debt rules, in the merchant's currency.

`201` → `{ "merchant": Merchant, "redirectUrl": "…" }`. Send the browser to `redirectUrl`: the
merchant approves a grant capped at `dailyCap` per day and comes back to
`/merchant.html?id=<merchantId>`.

### `GET /api/merchants/:id`

The till and dashboard.

```jsonc
{
  "id": "…", "name": "Tienda Doña Rosa", "wallet": "https://ilp.interledger-test.dev/tienda-rosa",
  "asset": { "assetCode": "COP", "assetScale": 2 },
  "dailyCap": Amount,
  "status": "awaiting-consent" | "active" | "rejected" | "revoked" | "failed",
  "spentToday": Amount | null,          // spent from the grant in its current 24 h interval
  "rules": [{ "id", "label", "kind", "destination", "shareBps", "outstanding"?: Amount, "repaid": Amount }],
  "today": { "salesCount", "gross": Amount, "kept": Amount, "allocated": Amount,
             "byRule": [{ "ruleId", "label", "amount": Amount }] },
  "history": [{ "date": "2026-10-16", "salesCount", "gross": Amount }],   // 7 Bogotá days, oldest first
  "sales": [Sale],                      // newest first, at most 20
  "createdAt": "…"
}
```

### `POST /api/merchants/:id/sales`

`{ "amount": "10000", "description": "Mercado" }` → `201 { "sale": Sale, "payUrl": "…/pay.html?sale=<id>" }`.
Show `payUrl` as a QR code.

### `GET /api/sales/:id`

Polls the customer's payment and settles the sale once it is paid. It is safe to call repeatedly.

```jsonc
{
  "id", "merchantId", "merchantName", "amount": Amount, "description"?,
  "status": "open" | "awaiting-consent" | "processing" | "paid" | "failed",
  "payUrl": "…/pay.html?sale=<id>", "customer"?: "https://…", "error"?: "…", "paidAt"?: "…",
  "payment"?: { "status", "steps": { "request", "authorization", "execution", "completion" },
                "debitAmount"?: Amount, "receivedAmount"?: Amount },
  "settlement": {
    "status": "pending" | "running" | "done" | "skipped", "reason"?, "kept"?: Amount,
    "items": [{ "ruleId", "label", "kind", "destination", "amount": Amount,
                "status": "processing" | "completed" | "failed" | "skipped", "capped": boolean,
                "paymentId"?, "error"? }]
  },
  "createdAt", "updatedAt"
}
```

### `POST /api/sales/:id/pay`

`{ "customerWallet": "$ilp.interledger-test.dev/cliente" }` → `201 { "sale": Sale, "redirectUrl": "…" }`.
The customer approves in their wallet and comes back to `/pay.html?sale=<id>`. Allowed while the
sale is `open` or `failed`, so a customer who rejected can try again.

If the merchant's authorization is not `active` (not approved yet, or revoked), the sale is still paid
to the merchant, but it is not split: its settlement is `skipped` with a reason.

## Open Payments sandbox

Generic flows used by `/sandbox.html` and available to any client.

| Method | Path                        | Body                                                                                                                             | Response                                                 |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/wallet-address?url=`  | —                                                                                                                                | currency and scale of a wallet address                   |
| POST   | `/api/payments`             | `{ sender, receiver, amount, description? }` (amount in the receiver's currency)                                                 | `{ payment, redirectUrl }`                               |
| GET    | `/api/payments/:id`         | —                                                                                                                                | payment with refreshed status and the four `steps`       |
| POST   | `/api/mandates`             | `{ sender, maxAmount, interval?, repetitions?, description? }`; `interval` is an ISO 8601 duration (`PT1M`, `P1D`, `P1W`, `P1M`) | `{ mandate, redirectUrl }`                               |
| GET    | `/api/mandates/:id`         | —                                                                                                                                | mandate, spent in the current interval, and its payments |
| POST   | `/api/mandates/:id/charges` | `{ receiver, amount, amountType?, description? }`                                                                                | payment                                                  |
| POST   | `/api/mandates/:id/split`   | `{ receivers: [{ receiver, amount }], amountType?, description? }`                                                               | result per receiver                                      |
| DELETE | `/api/mandates/:id`         | —                                                                                                                                | revoked mandate                                          |

`amountType` is `receive` (the default: the receiver gets exactly `amount` in their currency) or
`send` (the sender pays exactly `amount` in their currency).

## Consent callbacks

`GET /api/payments/:id/callback` and `GET /api/mandates/:id/callback` are called by the wallet through
the user's browser, never by a client. They verify the interaction hash, continue the grant, and
redirect to the page that started the flow.

`GET /api/health` → `{ "ok": true }`.
