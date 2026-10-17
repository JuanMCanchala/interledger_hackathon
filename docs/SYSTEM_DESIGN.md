# MiPlante system design

## 1. Goal

Split every sale a micro-merchant receives into the merchant's own profit and a set of obligations
(supplier credit, microcredit, savings), in real time and in proportion to the sale. All money moves
through Open Payments, and is capped by a monthly limit the merchant approved once in their own wallet.

Product context: [`product/PRODUCT_BRIEF.md`](product/PRODUCT_BRIEF.md). Decisions:
[`adr/`](adr/README.md).

## 2. Requirements

### Functional

| ID  | Requirement                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | A shopkeeper signs up, then registers their wallet, a monthly cap and 1–10 rules by category: obligations (share + monthly quota) or savings (share). |
| F2  | The merchant approves a single Open Payments grant: outgoing payments from their wallet up to the monthly cap per calendar month.            |
| F3  | The merchant creates a sale for an amount and gets a link and QR code for the customer.                                                      |
| F4  | The customer pays the sale from their own wallet, approving it in their wallet (payment request → authorization → execution → completion).   |
| F5  | When the payment completes, the sale is split by the rules: one outgoing payment per rule from the merchant's wallet. Debt balances go down. |
| F6  | The merchant sees today's sales and split, debt progress, savings, the cap spent today and a seven-day income history.                       |
| F7  | A developer sandbox exposes the raw flows: one-off payments, recurring grants, charges and splits.                                           |

### Non-functional

| ID  | Requirement                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| N1  | **Consent.** No money leaves a wallet without a grant its owner approved in their wallet.                                                        |
| N2  | **Safety cap.** The merchant can never be debited more than the monthly cap, even if our code is wrong.                                          |
| N3  | **Exact money.** Integer arithmetic only; the parts of a split add up exactly to the sale.                                                       |
| N4  | **Exactly-once settlement.** A sale is split once, even with concurrent polls, reloads or restarts.                                              |
| N5  | **Security.** Tokens and nonces never leave the server; callbacks are verified; only allow-listed wallet hosts are called; inputs are validated. |
| N6  | **Demo reliability.** Runs on one laptop (`docker compose up`); state lives in PostgreSQL and survives restarts.                                  |

## 3. Context & Technology Architecture (All-in-Docker)

![MiPlante Docker Architecture](architecture-docker.svg)

```mermaid
flowchart LR
  customer(["Customer<br/>Phone Browser (COP / USD)"])
  merchant(["Merchant<br/>Till & Dashboard"])

  subgraph MiPlante["🐳 Docker Desktop · docker-compose.yml (All 3 Services Containerized)"]
    subgraph Front["Container 1: Frontend (:3001)"]
      frontend["Angular PWA landing<br/>+ proxy (nginx / ng serve)"]
    end
    subgraph Back["Container 2: Backend (:3000)"]
      backend["Express API + till pages<br/>+ @interledger/open-payments"]
      prisma["Prisma ORM (PrismaStore)"]
    end
    subgraph DockerDB["Container 3: Database (:5432)"]
      db[("PostgreSQL 16 Container<br/>Persistent Volume")]
    end
    frontend -- "proxies /api and the pages<br/>(same domain)" --> backend
    backend --> prisma
    prisma -- "TCP :5432" --> db
  end

  subgraph Wallets["Interledger Open Payments Network (Auth + Resource Servers)"]
    cw[("Customer Wallets<br/>$ilp.../cliente-one (COP)<br/>$ilp.../extranjero-billeticos (USD)")]
    mw[("Merchant Main Wallet<br/>$ilp.../tienda-billeticos (COP)")]
    dw[("Split Destination Wallets<br/>$ilp.../proveedor-billeticos<br/>$ilp.../microcredito<br/>$ilp.../ahorro-billeticos")]
  end

  customer -- "scans QR, pays" --> frontend
  merchant -- "onboards, creates sales" --> frontend
  backend -- "GNAP grants, quotes, payments<br/>(HTTP Message Signatures)" --> Wallets
  customer -. "approves payment" .-> cw
  merchant -. "approves monthly cap" .-> mw
  cw == "ILP (COP / USD → COP)" ==> mw
  mw == "ILP Auto-Split" ==> dw
```

MiPlante never holds money. Funds move between wallets over Interledger, and MiPlante only creates
and tracks Open Payments resources with grants the wallet owners approved.

## 4. Components & Technology Stack (Front, Back & Docker DB)

```mermaid
flowchart TB
  subgraph Web["1. Frontend (Angular PWA, frontend/)"]
    landing["/ · Landing (GSAP, brand system)"]
    proxy["Proxy · nginx in production, ng serve in development"]
  end

  subgraph Pages["Merchant and customer pages (backend/public)"]
    ui_onboard["/onboard · Registro de Comercio y Reglas"]
    ui_merchant["/merchant · Caja Registradora (POS), Dashboard y Repartos"]
    ui_pay["/pay · Checkout QR del Cliente (COP/USD)"]
    ui_sandbox["/sandbox · Inspector de Flujos Open Payments"]
  end

  subgraph Api["2. Backend (Express + Prisma ORM, backend/)"]
    controllers["Express routes + zod validation<br/>merchants · sales · payments · mandates · callbacks"]
    merchants["MerchantService · SalesService · DashboardService<br/>settlement sweeper"]
    domain["Domain (pure TypeScript)<br/>planAllocations (BigInt) · Bogotá calendar"]
    flows["PaymentFlows<br/>one-off payments · monthly-cap mandates · split charges"]
    ops["OpenPaymentsOperations<br/>wallet discovery · grants · quotes · incoming/outgoing · GNAP hash"]
    prisma["PrismaStore (Store port)<br/>claimSettlement · transitionSale · recordRepayment"]
  end

  subgraph ExternalSDK["Interledger SDK"]
    sdk[("@interledger/open-payments")]
  end

  subgraph Docker["3. Database Layer (Docker Desktop)"]
    postgres[("PostgreSQL 16 Container (docker-compose)<br/>merchants · rules · sales · settlement_items · mandates · payments")]
  end

  proxy --> controllers
  proxy --> Pages
  Pages -- "fetch /api" --> controllers
  controllers --> merchants
  controllers --> flows
  merchants --> domain
  merchants --> flows
  merchants --> prisma
  flows --> ops
  flows --> prisma
  ops --> sdk
  prisma -- "DATABASE_URL (:5432)" --> postgres
```

| Tier | Layer / Module | Technology | Responsibility |
| :--- | :--- | :--- | :--- |
| **1. Frontend** | Landing | **Angular** PWA + **GSAP** | The public landing and the brand's design system (colors, type, doodles, paper texture). |
| **1. Frontend** | Proxy | **nginx** (production) / `ng serve` (development) | Puts the backend under the same domain: `/api/*`, the consent callbacks and the merchant and customer pages. |
| **2. Backend** | Pages | Plain HTML + ES modules (`backend/public`) | Mobile-first Spanish UI for onboarding, the till and dashboard (with split editing), the QR checkout and the sandbox, in the landing's design system (`css/miplante.css`). |
| **2. Backend** | API | **Express** + **zod** | REST endpoints, validation, error mapping and the GNAP interactive consent callbacks. |
| **2. Backend** | Application & Domain | TypeScript services + pure `BigInt` | Onboarding, split rules, sales, basis-point allocation (`planAllocations`), exactly-once settlement and the background sweeper. |
| **2. Backend** | Open Payments Adapter | `@interledger/open-payments` | Wallet discovery, interactive and non-interactive GNAP grants, quotes, incoming and outgoing payments, interaction hash verification and token rotation. |
| **2. Backend** | Data Access (ORM) | **Prisma ORM** (`PrismaStore`) | Typed schema, migrations, and atomic conditional updates that settle each sale exactly once (ADR 0010). |
| **3. Database** | Relational Storage | **PostgreSQL 16 (Docker)** | Containerized PostgreSQL instance orchestrated via `docker-compose.yml` storing `Merchant`, `Rule`, `Sale`, `SettlementItem`, `Mandate`, and `Payment` entities. |

## 5. Data model

```mermaid
erDiagram
  MERCHANT ||--|| MANDATE : "monthly-cap grant"
  MERCHANT ||--o{ RULE : has
  MERCHANT ||--o{ SALE : sells
  SALE ||--o| PAYMENT : "customer payment"
  SALE ||--o{ SETTLEMENT_ITEM : "split into"
  SETTLEMENT_ITEM ||--o| PAYMENT : "mandate charge"
  MANDATE ||--o{ PAYMENT : authorizes
```

| Record                            | Key fields                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Merchant**                      | `id`, `name`, `wallet`, `asset` (code + scale), `monthlyCap`, `rules[]`, `mandateId`, `ownerId`                                                              |
| **Rule**                          | `id`, `label`, `kind` (`debt` \| `savings`), `destination` wallet, `shareBps`, `outstanding` (debt), `repaid`                                   |
| **Sale**                          | `id`, `merchantId`, `amount`, `status` (`open` → `awaiting-consent` → `processing` → `paid` \| `failed`), `paymentId`, `customer`, `settlement` |
| **Settlement**                    | `status` (`pending` → `running` → `done` \| `skipped`), `items[]` (rule, amount, status, `capped`, `paymentId`), `kept`                         |
| **Payment** (Open Payments layer) | incoming/outgoing payment URLs, quote, amounts, status, the four demo `steps`; tokens kept server-side                                          |
| **Mandate** (Open Payments layer) | sender, `maxAmount`, `interval`, status; token and continuation kept server-side                                                                |

## 6. Key flows

### 6.1 Onboarding: one consent with a monthly cap

```mermaid
sequenceDiagram
  actor M as Merchant
  participant A as MiPlante API
  participant W as Merchant wallet (auth server)
  M->>A: POST /api/merchants {wallet, monthlyCap, rules} (Bearer session)
  A->>W: GET wallet address (asset, authServer)
  A->>W: grant request: outgoing-payment, limits {debitAmount: monthlyCap, interval: R/1st of month/P1M}, interact redirect + finish
  W-->>A: pending grant (redirect URL, continue token, finish nonce)
  A-->>M: redirectUrl
  M->>W: approves in the wallet
  W-->>M: redirect to /api/mandates/:id/callback?interact_ref&hash
  M->>A: callback
  A->>A: verify hash (clientNonce, finish nonce, interact_ref, authServer)
  A->>W: grant continue (interact_ref)
  W-->>A: access token (manage URL, expires_in)
  A-->>M: redirect to /merchant?id=…
```

### 6.2 Sale: the four steps the demo must show

```mermaid
sequenceDiagram
  actor C as Customer
  participant A as MiPlante API
  participant MW as Merchant wallet
  participant CW as Customer wallet
  Note over A: Merchant created the sale and shows the QR
  C->>A: POST /api/sales/:id/pay {customerWallet}
  Note over A,MW: 1. Payment request
  A->>MW: incoming-payment grant + incoming payment (incomingAmount = sale)
  A->>CW: quote grant + quote (debit in customer's currency)
  A->>CW: interactive outgoing-payment grant (limit = quote.debitAmount)
  A-->>C: redirectUrl
  Note over C,CW: 2. Authorization
  C->>CW: approves the payment
  CW-->>A: callback with interact_ref + hash (via browser)
  Note over A,CW: 3. Execution
  A->>CW: continue grant, then outgoing payment (quoteId)
  CW->>MW: funds over Interledger
  Note over A,MW: 4. Completion
  loop until completed
    A->>MW: read incoming payment
  end
```

If the quote expires while the customer is approving, the API quotes again and continues only if the
new cost is within what the customer approved.

### 6.3 Settlement: the sale splits itself

```mermaid
sequenceDiagram
  participant S as SalesService
  participant D as Allocation engine
  participant F as Open Payments flows
  participant MW as Merchant wallet
  participant DW as Destination wallets
  S->>S: sale paid and settlement pending, so mark it running (written first)
  S->>F: spent amount of the monthly grant in the current interval
  S->>D: planAllocations(sale, rules, remaining cap, paid this month)
  D-->>S: allocations (floor rounding, debt ≤ quota left and outstanding, cap respected)
  loop each allocation > 0, in rule order
    S->>F: chargeMandate(rule.destination, amount, send)
    F->>DW: incoming payment (open amount)
    F->>MW: quote (debitAmount) + outgoing payment with the merchant's monthly-cap token
    S->>S: add amount to rule.repaid, subtract it from the debt outstanding
  end
  S->>S: settlement done, kept = sale − Σ allocations
```

## 7. Open Payments usage

| Step                 | Resource or grant                                                                   | Interaction                         | Where                                    |
| -------------------- | ----------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------- |
| Discover a wallet    | Wallet address (`GET`)                                                              | none                                | `operations.getWalletAddress`            |
| Payment request      | `incoming-payment` grant (create, read) + incoming payment                          | non-interactive                     | `operations.createIncomingPayment`       |
| Price it             | `quote` grant + quote                                                               | non-interactive                     | `operations.createQuote`                 |
| Customer consent     | `outgoing-payment` grant, `limits.debitAmount` = quote                              | **interactive** (redirect + finish) | `flows.startPayment` / `completePayment` |
| Merchant's monthly cap | `outgoing-payment` grant, `limits.debitAmount` = cap, `limits.interval` = `R/…/P1M` | **interactive**, once               | `flows.startMandate` / `completeMandate` |
| Execute              | outgoing payment (`quoteId`)                                                        | uses the grant token                | `operations.createOutgoingPayment`       |
| Track                | incoming payment `completed` / `receivedAmount`, outgoing payment `failed`          | —                                   | `flows.refreshPayment`                   |
| Cap spent            | `GET /outgoing-payment-grant` (spent amounts in the current interval)               | —                                   | `operations.getGrantSpentAmounts`        |
| Keep access          | token rotation on expiry or 401; grant cancel on revoke                             | —                                   | `operations.rotateToken` / `cancelGrant` |

## 8. Money rules

Given a sale of `S` minor units and rules `r₁…rₙ` in the merchant's order:

```
allocᵢ = floor(S × shareBpsᵢ / 10,000)
allocᵢ = min(allocᵢ, outstandingᵢ)              debt rules only
allocᵢ = min(allocᵢ, remainingCap)               if the spent amount is known; remainingCap −= allocᵢ
kept   = S − Σ allocᵢ
```

Constraints: shares are whole basis points, and `Σ shareBps ≤ 5,000` (the merchant keeps at least
half). Example: a sale of 10,000.00 COP with rules of 15% and 5% splits into 1,500.00 + 500.00, and
the merchant keeps 8,000.00.

## 9. Consistency and idempotency

- **Callbacks** run only while the record is `awaiting-consent` and clear the interaction once used,
  so a reload cannot continue a grant twice.
- **Settlement** has a persisted state machine (`pending → running → done | skipped`). The move to
  `running` is one conditional `UPDATE` (`claimSettlement`), done before the first payment is created,
  so only one poll, sweeper or server instance can split a sale
  ([ADR 0010](adr/0010-postgresql-through-prisma-with-atomic-transitions.md)).
- **Payment status** changes on a sale (`transitionSale`) are conditional on the expected status and
  never rewrite the settlement, so a slow poll cannot reopen a split that already started.
- **Debt balances** are reduced when the repayment's outgoing payment is created successfully, in
  one atomic `UPDATE` (`repaid + x`, `GREATEST(outstanding - x, 0)`). If the creation fails, the
  balance is untouched and the item is marked `failed`.
- **Restarts** are safe: records are persisted in PostgreSQL after every change, and the sweeper picks up any sale
  left in `processing` or `paid` with a pending settlement.
- **Known limitation:** if the process dies in the middle of a settlement, the sale stays `running`
  with every item sent so far recorded (items are persisted one by one). It is not resumed
  automatically; a production version would resume from the recorded items.

## 10. Security

| Threat                                 | Mitigation                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Forged consent callback                | GNAP interaction hash verified with a constant-time comparison; one-shot interactions                                          |
| SSRF through user-supplied wallet URLs | Only hosts in `OP_ALLOWED_WALLET_HOSTS` are called (default `ilp.interledger-test.dev`); `https` only                          |
| Token leakage                          | Tokens, nonces and continuation data are stripped from every API response and stay in PostgreSQL, which is never exposed publicly |
| Over-collection                        | Wallet-enforced monthly cap (ADR 0004, 0013), debt ≤ monthly quota, total shares ≤ 99%                                                   |
| Malicious input                        | zod validation on every body and query; JSON limited to 20 kB; amounts validated against the asset scale                       |
| Script injection in the UI             | Server data rendered with `textContent` only                                                                                   |
| Secrets in a public repo               | `private.key`, `*.pem`, `.env*` git-ignored; the key can also come from `OP_PRIVATE_KEY`                                       |

## 11. Failure modes

| Failure                        | Behavior                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Customer rejects in the wallet | Payment `rejected`, sale `failed`; the customer can try again                                        |
| Quote expired during consent   | Quote again; fail with 409 if the new cost exceeds the approved amount                               |
| Access token expired           | Rotate before expiry and once more on 401                                                            |
| Monthly cap reached            | Allocations reduced to the remaining cap; the rest is not collected that month (`capped`)            |
| Cap spent amount unavailable   | Allocate without pre-capping; the wallet still rejects excess debits, so the item is marked `failed` |
| Merchant revoked the grant     | Settlement `skipped` with a reason; sales still reach the merchant                                   |
| Destination wallet missing     | That item `failed`; other items continue                                                             |
| Server restart mid-flow        | Records persisted; the sweeper resumes polling and settlement                                        |

## 12. Limits and path to production

| Today (hackathon)          | Production                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| PostgreSQL in Docker, atomic settlement claims | Managed PostgreSQL, tokens encrypted at rest, automatic resume of interrupted settlements |
| Polling every few seconds  | Backoff and batching; provider notifications where available                              |
| Test-network wallets       | Colombian wallet providers adopting Open Payments; cash-in and cash-out at banking agents |
| Rules set by the merchant  | Rules agreed with the lender, with a lender-side portal and reporting                     |
| Seven-day history          | Verifiable, consent-based income passport for formal credit                               |

## 13. Testing strategy

- **Unit:** money math, interaction hash, intervals, wallet address normalization, allocation engine.
- **Flow:** Open Payments flows, merchants and sales against an in-memory fake of `PaymentOperations`
  that records every call (no network), on `MemoryStore`.
- **Storage:** `tests/prismaStore.test.ts` runs record round trips, racing polls, racing claims and
  concurrent repayments against a real PostgreSQL when `TEST_DATABASE_URL` is set (CI provides one).
- **HTTP:** validation, error mapping, token redaction and callback redirects against a real Express
  server on a random port.
- **Manual end-to-end:** the sandbox and the MiPlante screens against the Interledger test wallet
  (see [`OPEN_PAYMENTS.md`](OPEN_PAYMENTS.md)).
