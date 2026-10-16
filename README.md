# MiPlante

**Every sale splits itself.** MiPlante lets Colombian micro-merchants repay suppliers and microcredit
in proportion to what they actually sell, using [Open Payments](https://openpayments.dev). If there are
no sales today, nothing is collected today.

[![CI](https://github.com/JuanMCanchala/interledger_hackathon/actions/workflows/ci.yml/badge.svg)](https://github.com/JuanMCanchala/interledger_hackathon/actions/workflows/ci.yml)

Built at the **Open Payments Hackathon by Interledger** (Ruta N, Medellín, October 16–17, 2026).
_Plante_ is Colombian slang for the working capital a small business runs on.

## The problem

- Colombia has **5.3 million micro-businesses** ([DANE, 2024](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-2024.pdf)).
  They sell small amounts every day, but their obligations are fixed: the supplier comes on Monday
  and the loan installment is due on Friday, whatever the week was like.
- When a slow week breaks that chain, formal credit is out of reach. **35.6%** of the
  micro-businesses that asked for credit in 2025 got it from _gota a gota_ lenders
  ([DANE](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-24Ciudades-2025.pdf)), who
  charge up to 20% a month, over 790% a year, against a legal cap of 87.62%.
- Repaying lenders with a percentage of each sale already works at Mercado Pago, Square and
  Shopify, but only for sales inside their closed platforms. A neighborhood shop paid from many
  wallets is left out.

Details and sources: [`docs/product/PROBLEM.md`](docs/product/PROBLEM.md).

## How it works

1. **Set up once.** The merchant lists their obligations, for example a microcredit repaid with 15% of
   each sale until 300,000 COP are covered, and an emergency fund that gets 5%. They also set a daily
   cap and approve **one Open Payments grant** in their own wallet.
2. **Sell.** The till shows a QR code. The customer scans it and pays from their own wallet, at any
   provider, approving the payment in that wallet.
3. **Split.** As soon as the payment arrives, the sale splits itself:

   |       Sale | Merchant keeps | Microcredit (15%) | Emergency fund (5%) |
   | ---------: | -------------: | ----------------: | ------------------: |
   | 10,000 COP |      **8,000** |             1,500 |                 500 |

4. **See.** The dashboard shows today's sales and split, how much of each debt is left, the savings,
   the cap used today and a seven-day income history.

**The four promises.** These are guaranteed by Open Payments, not just by our code:

- **No sales, no collection.** Shares are taken only from real sales.
- **Never above the cap.** The merchant's wallet enforces the daily cap.
- **The merchant always keeps the majority.** Rules can take at most 50% of a sale.
- **Revocable at any time** from the merchant's own wallet.

## Open Payments, end to end

| Demo step           | What happens                                                                           | Open Payments                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Payment request** | The merchant creates a sale and shows its QR code; the customer enters their wallet    | `incoming-payment` grant and incoming payment on the merchant's wallet; `quote` grant and quote on the customer's                                                   |
| **Authorization**   | The customer approves in their own wallet                                              | Interactive `outgoing-payment` grant (GNAP redirect and finish, interaction hash verified)                                                                          |
| **Execution**       | MiPlante creates the payment; Interledger delivers it, converting currencies if needed | Outgoing payment from the quote                                                                                                                                     |
| **Completion**      | The incoming payment completes, and the sale splits itself                             | Incoming payment polled until completed; one outgoing payment per rule under the merchant's grant (`limits.debitAmount` = daily cap, `limits.interval` = `R/…/P1D`) |

Integration details: [`docs/OPEN_PAYMENTS.md`](docs/OPEN_PAYMENTS.md).

## Architecture & Technology Stack (100% Dockerized)

![MiPlante Docker Architecture](docs/architecture-docker.svg)

```mermaid
flowchart LR
  subgraph Docker["🐳 Docker Desktop · docker-compose.yml"]
    subgraph Front["Container 1 · Frontend (Next.js :3001)"]
      web["Next.js App Router<br/>POS Till · QR Checkout · Onboarding · Live Dashboard"]
    end

    subgraph Back["Container 2 · Backend (NestJS + Prisma :3000)"]
      controllers["NestJS Controllers<br/>REST API & GNAP Callbacks"]
      services["Application Services<br/>MerchantsModule · SalesModule · SettlementSweeper"]
      domain["Domain Layer<br/>Allocation Engine (Pure BigInt)"]
      op["OpenPaymentsModule<br/>@interledger/open-payments SDK"]
      prisma["Prisma ORM<br/>PrismaService & $transaction Locks"]
    end

    subgraph DB["Container 3 · Database (PostgreSQL :5432)"]
      pg[("PostgreSQL 16 Container<br/>Merchants · Rules · Sales · Mandates · Payments")]
    end
  end

  subgraph ILP["Interledger Network (Open Payments)"]
    wallets[("6 Official Wallets<br/>Tienda · Ahorro · Proveedor · Microcrédito · Clientes (COP/USD)")]
  end

  web -- "HTTP / JSON" --> controllers
  controllers --> services
  services --> domain
  services --> op
  services --> prisma
  prisma -- "TCP :5432" --> pg
  op -- "GNAP Grants, Quotes &<br/>HTTP Message Signatures" --> wallets
```

All three tiers run inside **Docker Desktop** (`docker-compose.yml`): **Container 1: Frontend** (`Next.js`), **Container 2: Backend** (`NestJS` + `Prisma ORM` + `@interledger/open-payments`), and **Container 3: Database** (`PostgreSQL 16`). Key architecture decisions are recorded as ADRs:

- [Build the Open Payments layer first](docs/adr/0002-build-the-open-payments-layer-first.md):
  the mandatory flow worked before the idea was chosen.
- [Grant caps in the wallet, percentages in the app](docs/adr/0004-grant-caps-with-percentage-rules-in-the-app.md):
  Open Payments limits amounts per interval, not percentages, so the wallet enforces the cap and
  MiPlante applies the shares.
- [Integer money and merchant-favorable rounding](docs/adr/0005-integer-money-and-merchant-favorable-rounding.md).
- [Settle each sale exactly once, by polling](docs/adr/0006-settle-sales-by-polling-idempotently.md):
  Open Payments has no webhooks for client apps.
- [Target Stack: Next.js, NestJS, Prisma ORM and PostgreSQL](docs/adr/0009-adopt-nextjs-nestjs-prisma-and-postgresql-stack.md).
- [PostgreSQL through Prisma, with atomic state transitions](docs/adr/0010-postgresql-through-prisma-with-atomic-transitions.md):
  a sale is split exactly once, even with concurrent polls or several instances.

Full design: [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) · All decisions:
[`docs/adr/`](docs/adr/README.md).

## Quick start

Requires Node.js 22 or later (developed on 26), Docker and an account on the
[Interledger test wallet](https://wallet.interledger-test.dev).

```bash
npm install                          # also generates the Prisma client
cp env.example .env                  # MiPlante's wallet address and developer key ID
# put the downloaded private.key in the repository root (it is git-ignored)
npm run check:wallet                 # verifies the wallet and the key
npm run db:up                        # PostgreSQL 16 in Docker
npm run db:deploy                    # applies the migrations in prisma/migrations
npm run dev                          # http://localhost:3000
```

Or run everything in containers with `npm run docker:up`; the backend applies the migrations when
it starts. After changing `prisma/schema.prisma`, create a migration with
`npm run db:migrate -- --name <change>`.

Then open:

- `/onboard.html` to register a merchant;
- `/merchant.html?id=…` for the till;
- `/pay.html?sale=…` for the customer, from the QR code;
- `/sandbox.html` for the raw Open Payments flows.

Setting up the test wallet, step by step:
[`docs/OPEN_PAYMENTS.md`](docs/OPEN_PAYMENTS.md#1-set-up-the-test-wallet-once). Pitch and demo
script: [`docs/DEMO.md`](docs/DEMO.md).

## Project structure

```
src/
  domain/          allocation engine and Bogotá calendar (pure functions)
  merchants/       onboarding, sales, settlement, dashboard
  openPayments/    adapter over the SDK: grants, quotes, payments, hash, tokens
  storage/         Store port: PostgreSQL through Prisma, in memory for tests
  shared/          money (BigInt minor units) and errors
  http/            Express routes and zod validation
prisma/            schema and migrations
public/            Spanish, mobile-first web client (no build step)
tests/             Vitest: domain, flows against an Open Payments fake, HTTP
docs/              problem, ideation, product brief, ADRs, system design, API, demo
scripts/           check-wallet diagnostic
```

## Quality

```bash
npm run typecheck    # strict TypeScript
npm test             # domain, Open Payments flows, merchants, sales, settlement, HTTP
# plus the PostgreSQL storage tests, on a throwaway database they empty
# (create it once: docker exec miplante-db createdb -U miplante miplante_test)
TEST_DATABASE_URL=postgresql://miplante:miplante@localhost:5432/miplante_test npm test
```

Tests run against an in-memory fake of the Open Payments operations, so they need no network. CI
runs everything, PostgreSQL included, on every push. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branches and
conventions.

## Documentation

Start at [`docs/README.md`](docs/README.md), which follows the order the project was thought through:
problem → ideation → product brief → decisions → system design → integration → API → demo.

## Hackathon notes

- **Judging criteria:** problem definition, use of Open Payments, user experience, technical quality,
  presentation, innovation, inclusion and impact.
- **AI usage:** disclosed in [`AI_USAGE.md`](AI_USAGE.md), with the prompt log in `/prompts`, as the
  hackathon's AI policy requires.

## Team

| Name              | Role |
| ----------------- | ---- |
| _to be completed_ |      |

## License

To be decided by the team before the final submission.
