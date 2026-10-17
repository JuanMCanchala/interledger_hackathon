# HTTP API

JSON over HTTP, served under `/api`. Amounts in requests are decimal strings in major units
(`"10000"`, `"12.50"`). Amounts in responses are Open Payments amounts in minor units:

```json
{ "value": "1000000", "assetCode": "COP", "assetScale": 2 }
```

Wallet addresses accept the payment pointer form (`$ilp.interledger-test.dev/rosa`) or `https://`.

Errors have this shape. Status codes: 400 invalid input, 401 no valid session, 404 unknown resource,
409 invalid state, 422 a charge failed, 502 the wallet rejected a request.

```json
{
  "error": "Datos inválidos",
  "details": ["amount: usa un número positivo, por ejemplo 12.50"]
}
```

## Accounts

Shopkeepers sign up with an email and a password. The password is stored only as a salted scrypt
hash. Signing up or in returns a random session token valid for 30 days; the shopkeeper's routes
need it as `Authorization: Bearer <token>`. The customer's routes (`/api/sales/:id`, its `pay` and
`callback`) need no session.

### `POST /api/auth/register`

`{ "name": "Rosa", "email": "rosa@example.com", "password": "at least 8 characters" }` →
`201 { "token": "…", "user": { "id", "name", "email" } }`. The email is stored in lowercase, and a
second account with it answers `409`.

### `POST /api/auth/login`

`{ "email", "password" }` → `200 { "token", "user" }`. A wrong email or password answers `401` with
the same message for both.

### `POST /api/auth/logout`

Ends the session in the `Authorization` header. `204`.

### `GET /api/auth/me`

`200 { "user": { "id", "name", "email" }, "merchant": Merchant | null }`. `merchant` is the shop
the account registered, or `null` before it sets one up: the web app uses it to send the
shopkeeper to their till or to the setup stepper.

## MiPlante

Every `/api/merchants` route needs a session. A shop answers only to the account that registered
it: for any other account it does not exist (`404`).

### `POST /api/merchants`

Registers the signed-in account's shop and starts the single consent MiPlante needs.

```json
{
  "name": "Tienda Doña Rosa",
  "wallet": "$ilp.interledger-test.dev/tienda-rosa",
  "monthlyCap": "500000",
  "rules": [
    {
      "label": "Distribuidora",
      "category": "Proveedores",
      "kind": "debt",
      "destination": "$ilp.interledger-test.dev/proveedor-billeticos",
      "sharePercent": 10,
      "monthlyQuota": "200000"
    },
    {
      "label": "Microcrédito",
      "category": "Microcréditos",
      "kind": "debt",
      "destination": "$ilp.interledger-test.dev/cooperativa",
      "sharePercent": 15,
      "monthlyQuota": "100000",
      "outstanding": "300000"
    },
    {
      "label": "Fondo de emergencia",
      "category": "Ahorro",
      "kind": "savings",
      "destination": "$ilp.interledger-test.dev/ahorro-rosa",
      "sharePercent": 5
    }
  ]
}
```

- 1–10 rules, applied in order (their priority when the monthly cap runs out). `category` is free
  text (1–40 characters) the shop uses to group its wallets; several rules can share one.
- `sharePercent`: from 0.01 to 50, with at most two decimals. The rules together can take at most 50%
  of each sale.
- A debt (an obligation: supplier, microcredit, rent…) needs a `monthlyQuota`. It takes its share of
  each sale until this calendar month's quota is paid; after that its share stays with the shop
  until the 1st of next month. `outstanding`, the total balance, is optional: when set, the debt
  also stops once it is paid off.
- Savings have no quota and always take their share, within the monthly cap. A savings rule can
  carry an optional `savingsGoal`, the amount the shop wants to reach; it is only shown as a goal.
- `monthlyCap` must be at least the sum of the quotas; what is left is room for savings.

`201` → `{ "merchant": Merchant, "redirectUrl": "…" }`. Send the browser to `redirectUrl`: the
merchant approves a grant capped at `monthlyCap` per calendar month (interval
`R/<1st of the month, 00:00 Bogotá>/P1M`) and comes back to `/merchant?id=<merchantId>`.

### `GET /api/merchants/:id`

The till and dashboard.

```jsonc
{
  "id": "…", "name": "Tienda Doña Rosa", "wallet": "https://ilp.interledger-test.dev/tienda-rosa",
  "asset": { "assetCode": "COP", "assetScale": 2 },
  "monthlyCap": Amount,
  "pendingCap": Amount | null,          // a new cap waiting for approval in the wallet
  "monthlySalesGoal": Amount | null,
  "status": "awaiting-consent" | "active" | "rejected" | "revoked" | "failed",
  "spentThisMonth": Amount | null,      // spent from the grant in its current interval (this month)
  "rules": [{ "id", "label", "category", "kind", "destination", "shareBps",
              "monthlyQuota"?: Amount, "outstanding"?: Amount, "savingsGoal"?: Amount,
              "repaid": Amount, "paidThisMonth": Amount }],
  "today": { "salesCount", "gross": Amount, "kept": Amount, "allocated": Amount,
             "byRule": [{ "ruleId", "label", "amount": Amount }] },
  "history": [{ "date": "2026-10-16", "salesCount", "gross": Amount }],   // 7 Bogotá days, oldest first
  "month": { "dayOfMonth": 16, "daysInMonth": 31, "salesCount", "gross": Amount, "kept": Amount,
             "allocated": Amount,
             "days": [{ "date", "salesCount", "gross": Amount, "allocated": Amount }] },  // 1st to today
  "sales": [Sale],                      // newest first, at most 20
  "createdAt": "…"
}
```

### `PUT /api/merchants/:id/rules`

The shop changes how its **next** sales split. No new consent is needed as long as the quotas fit
in the monthly cap: the wallet grant only caps the monthly total, and the percentages and quotas
are applied by MiPlante (ADR 0004, ADR 0013).

```jsonc
{ "rules": [
  { "id": "<existing rule>", "label": "Microcrédito", "category": "Microcréditos", "kind": "debt",
    "destination": "$ilp.interledger-test.dev/microcredito", "sharePercent": 10,
    "monthlyQuota": "100000" },
  { "label": "Lácteos", "category": "Proveedores", "kind": "debt",
    "destination": "$ilp.interledger-test.dev/proveedor-billeticos", "sharePercent": 10,
    "monthlyQuota": "50000" },
  { "id": "<existing rule>", "label": "Ahorro", "category": "Ahorro", "kind": "savings",
    "destination": "$ilp.interledger-test.dev/ahorro-billeticos", "sharePercent": 5 }
] }
```

→ `200` with the merchant, as `GET /api/merchants/:id` without the dashboard fields.

- The list replaces the rules, in order: rules with an `id` are kept, rules without one are new,
  and missing ones are removed.
- What each rule has repaid is always kept. A debt keeps its stored balance unless `outstanding`
  is sent, so an edit never undoes a repayment recorded meanwhile.
- The same limits as onboarding apply: 1–10 rules, at most 50% in total, a quota for every debt,
  quotas within the monthly cap, and never the shop's own wallet as a destination. Otherwise the
  answer is `400` and nothing changes.

### `PUT /api/merchants/:id/settings`

`{ "name"?: "La Esquina", "monthlySalesGoal"?: "3000000" | null }` → `200` with the merchant.
Renames the shop or sets (`null` clears) its monthly sales goal. Neither touches the wallet grant.

### `POST /api/merchants/:id/cap`

`{ "monthlyCap": "600000" }` → `201 { "merchant", "redirectUrl" }`. An approved grant's limit cannot
be raised, so this asks for a new grant: send the browser to `redirectUrl`. The current grant keeps
paying the splits (`pendingCap` shows the new one) until the merchant approves; then the new grant
replaces it and the old one is revoked. If the merchant rejects, the current cap stays. The cap must
still cover the month's quotas, and a shop without an active grant switches at once.

### `POST /api/merchants/:id/consent`

Asks for the monthly-capped consent again, with the same cap and rules, when the first attempt was
never approved, was rejected (for example, the merchant logged in with another account) or was
revoked. `201` → `{ "merchant": Merchant, "redirectUrl": "…" }`. Answers `409` if the
consent is already active.

### `POST /api/merchants/:id/sales`

`{ "amount": "10000", "description": "Mercado" }` →
`201 { "sale": Sale, "payUrl": "https://wallet.interledger-test.dev/send?merchantWA=<incoming payment>", "checkoutUrl": "…/pay?sale=<id>" }`.

The panel also offers `/cobro?sale=<id>`, a full-screen checkout for the shopkeeper's phone: the
same QR, the amount and the live state, with no session needed (it only reads `GET /api/sales/:id`).

Each sale is an Open Payments **payment request**: an incoming payment on the shop's wallet with
`incomingAmount` equal to the sale. Show `payUrl` as a QR code. There are two ways to pay it, and
both pay that same incoming payment, so a sale can only be paid once:

- **QR, in the customer's wallet app.** `payUrl` opens the wallet's send screen on the incoming
  payment (`OP_WALLET_SEND_URL`, the Interledger test wallet's `/send?merchantWA=`). The screen
  fills in what is left of the incoming payment's amount (the customer can still change it), locks
  the description and the receive mode, and preselects
  the customer's wallet. A customer without a session logs in and comes back to it. They only
  confirm. With `OP_WALLET_SEND_URL` empty, `payUrl` is the incoming payment URL itself, which any
  Open Payments wallet can pay. The customer's phone never needs to reach MiPlante.
- **`checkoutUrl`, MiPlante's checkout.** This is the one-time payment flow from the Open Payments
  guide: the customer gives their wallet address, and MiPlante creates a quote on it and requests an
  interactive outgoing-payment grant limited to the quote's `debitAmount`. The customer approves in
  their wallet and MiPlante creates the outgoing payment (`POST /api/sales/:id/pay`). It needs the
  customer's phone to reach MiPlante.

The sale stays `open` until the money arrives. If the customer sends less, it is `processing`
with `pending` set to what is missing, it is not split, and the same QR asks for the rest. MiPlante polls the incoming payment (the till and the
background sweeper), marks the sale `paid` when it completes and then splits it. A request that
expires unpaid (after one hour) fails the sale, and its `payUrl` falls back to the checkout.

### `GET /api/sales/:id`

Polls the customer's payment and settles the sale once it is paid. It is safe to call repeatedly.

```jsonc
{
  "id", "merchantId", "merchantName", "amount": Amount, "description"?,
  "status": "open" | "awaiting-consent" | "processing" | "paid" | "failed",
  "payUrl": "https://wallet.interledger-test.dev/send?merchantWA=…" | "…/pay?sale=<id>",
  "checkoutUrl": "…/pay?sale=<id>",
  "customer"?: "https://…", "error"?: "…", "paidAt"?: "…",
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
The customer approves in their wallet and comes back to `/pay?sale=<id>`. Allowed while the
sale is `open` or `failed`, so a customer who rejected can try again.

If the merchant's authorization is not `active` (not approved yet, or revoked), the sale is still paid
to the merchant, but it is not split: its settlement is `skipped` with a reason.

## Open Payments sandbox

Generic flows used by `/sandbox` and available to any client.

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
