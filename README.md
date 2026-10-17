# MiPlante

**Every sale splits itself.** MiPlante lets Colombian micro-merchants repay suppliers and microcredit
in proportion to what they actually sell, using [Open Payments](https://openpayments.dev). If there are
no sales today, nothing is collected today.

[![CI](https://github.com/JuanMCanchala/interledger_hackathon/actions/workflows/ci.yml/badge.svg)](https://github.com/JuanMCanchala/interledger_hackathon/actions/workflows/ci.yml)

Built at the **Open Payments Hackathon by Interledger** (Ruta N, Medellín, October 16–17, 2026).

**Live demo:** <https://frontend-production-4075.up.railway.app> (Interledger test network; deployment notes in [`docs/DEPLOY.md`](docs/DEPLOY.md)).
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

1. **Set up once.** The merchant creates an account and sets up the shop in three steps. They list
   their obligations by category, for example a supplier paid with 10% of each sale up to 200,000 COP
   a month and a microcredit with 15% up to 100,000 COP a month, plus an emergency fund that gets 5%.
   They set a monthly cap and approve **one Open Payments grant** in their own wallet. Once a month's
   quotas are paid, the rest of the month's sales are profit.
2. **Sell.** The till shows a QR code. The customer scans it and pays from their own wallet, at any
   provider, approving the payment in that wallet.
3. **Split.** As soon as the payment arrives, the sale splits itself:

   |       Sale | Merchant keeps | Microcredit (15%) | Emergency fund (5%) |
   | ---------: | -------------: | ----------------: | ------------------: |
   | 10,000 COP |      **8,000** |             1,500 |                 500 |

4. **See.** The dashboard shows today's sales and split, how much of each debt is left, the savings,
   how much of each monthly quota is paid, the savings, the cap used this month and a seven-day
   income history.

**The four promises.** These are guaranteed by Open Payments, not just by our code:

- **No sales, no collection.** Shares are taken only from real sales.
- **Never above the cap.** The merchant's wallet enforces the monthly cap.
- **The merchant always keeps the majority.** Rules can take at most 50% of a sale.
- **Revocable at any time** from the merchant's own wallet.

## Open Payments, end to end

| Demo step           | What happens                                                                           | Open Payments                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Payment request** | The merchant creates a sale and shows its QR code; the customer enters their wallet    | `incoming-payment` grant and incoming payment on the merchant's wallet; `quote` grant and quote on the customer's                                                   |
| **Authorization**   | The customer approves in their own wallet                                              | Interactive `outgoing-payment` grant (GNAP redirect and finish, interaction hash verified)                                                                          |
| **Execution**       | MiPlante creates the payment; Interledger delivers it, converting currencies if needed | Outgoing payment from the quote                                                                                                                                     |
| **Completion**      | The incoming payment completes, and the sale splits itself                             | Incoming payment polled until completed; one outgoing payment per rule under the merchant's grant (`limits.debitAmount` = monthly cap, `limits.interval` = `R/<1st of the month>/P1M`) |

Integration details: [`docs/OPEN_PAYMENTS.md`](docs/OPEN_PAYMENTS.md).

## Architecture & Technology Stack (100% Dockerized)

![MiPlante Docker Architecture](docs/architecture-docker.svg)

```mermaid
flowchart LR
  subgraph Docker["🐳 docker-compose.yml · Railway in production"]
    subgraph Front["Container 1 · Frontend (:3001)"]
      web["Angular PWA + GSAP<br/>Landing and brand system"]
      proxy["nginx in production · ng serve in development<br/>proxies /api and the till pages"]
    end

    subgraph Back["Container 2 · Backend (Express + Prisma :3000)"]
      pages["Till · Onboarding · QR checkout · Sandbox<br/>backend/public, no build step"]
      routes["Express routes + zod<br/>REST API and GNAP callbacks"]
      services["MerchantService · SalesService · sweeper"]
      domain["Allocation engine (pure BigInt)"]
      op["Open Payments adapter<br/>@interledger/open-payments SDK"]
      store["PrismaStore<br/>atomic conditional UPDATEs"]
    end

    subgraph DB["Container 3 · Database (PostgreSQL 16)"]
      pg[("Merchants · Rules · Sales · Mandates · Payments")]
    end
  end

  subgraph ILP["Interledger Network (Open Payments)"]
    wallets[("6 team wallets<br/>Tienda · Ahorro · Proveedor · Microcrédito · Clientes (COP/USD)")]
  end

  web --- proxy
  proxy -- "same domain" --> routes
  proxy -- "same domain" --> pages
  routes --> services
  services --> domain
  services --> op
  services --> store
  store -- "TCP :5432" --> pg
  op -- "GNAP grants, quotes and<br/>HTTP message signatures" --> wallets
```

Three containers, the same in `docker-compose.yml` and on Railway:

- **Frontend:** the Angular landing (PWA, GSAP, the brand's design system). It also puts the backend
  under the same domain: nginx in production and `ng serve` in development proxy `/api/*` and the
  till, onboarding, checkout and sandbox pages. People, QR codes and the wallets' consent callbacks
  only ever use the frontend URL.
- **Backend:** Express, zod, Prisma and `@interledger/open-payments`. It serves the API and the
  merchant and customer pages.
- **Database:** PostgreSQL 16.

Key architecture decisions are recorded as ADRs:

- [Build the Open Payments layer first](docs/adr/0002-build-the-open-payments-layer-first.md):
  the mandatory flow worked before the idea was chosen.
- [Grant caps in the wallet, percentages in the app](docs/adr/0004-grant-caps-with-percentage-rules-in-the-app.md):
  Open Payments limits amounts per interval, not percentages, so the wallet enforces the cap and
  MiPlante applies the shares.
- [Integer money and merchant-favorable rounding](docs/adr/0005-integer-money-and-merchant-favorable-rounding.md).
- [Settle each sale exactly once, by polling](docs/adr/0006-settle-sales-by-polling-idempotently.md):
  Open Payments has no webhooks for client apps.
- [Containers, Prisma and PostgreSQL](docs/adr/0009-adopt-nextjs-nestjs-prisma-and-postgresql-stack.md),
  refined by [an Angular landing behind one domain and an Express backend](docs/adr/0011-angular-landing-behind-one-domain-with-an-express-backend.md).
- [PostgreSQL through Prisma, with atomic state transitions](docs/adr/0010-postgresql-through-prisma-with-atomic-transitions.md):
  a sale is split exactly once, even with concurrent polls or several instances.

Full design: [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) · All decisions:
[`docs/adr/`](docs/adr/README.md).

## Quick start

Requires Node.js 22 or later (developed on 26), Docker and an account on the
[Interledger test wallet](https://wallet.interledger-test.dev).

```bash
npm --prefix backend install         # also generates the Prisma client
cp env.example backend/.env          # MiPlante's wallet address and developer key ID
# put the downloaded private.key in backend/ (it is git-ignored)
npm run check:wallet                 # verifies the wallet and the key
npm run db:up                        # PostgreSQL 16 in Docker
npm run db:deploy                    # applies the migrations in backend/prisma/migrations
npm run dev                          # http://localhost:3000
```

Or run everything in containers with `npm run docker:up`: Compose reads `.env` and `private.key`
from the repository root, and the backend applies the migrations when it starts. After changing
`backend/prisma/schema.prisma`, create a migration with `npm run db:migrate -- --name <change>`.

Then open:

- `/register` to create an account and set up a shop, or `/login` to open its till (or
  `npm run demo:merchant` for the demo shop with the team's wallets);
- `/merchant?id=…` for the till, where the shop can also change its splits;
- `/pay?sale=…` for the customer, from the QR code;
- `/sandbox` for the raw Open Payments flows.

Setting up the test wallet, step by step:
[`docs/OPEN_PAYMENTS.md`](docs/OPEN_PAYMENTS.md#1-set-up-the-test-wallet-once). Pitch and demo
script: [`docs/DEMO.md`](docs/DEMO.md).

## Project structure

```
backend/
  src/
    domain/        allocation engine and Bogotá calendar (pure functions)
    merchants/     onboarding, split rules, sales, settlement, dashboard
    openPayments/  adapter over the SDK: grants, quotes, payments, hash, tokens
    storage/       Store port: PostgreSQL through Prisma, in memory for tests
    shared/        money (BigInt minor units) and errors
    http/          Express routes and zod validation
  prisma/          schema and migrations
  public/          Spanish, mobile-first web client (no build step)
  tests/           Vitest: domain, flows against an Open Payments fake, HTTP, PostgreSQL
  scripts/         check-wallet diagnostic, demo-merchant setup
frontend/          Angular PWA landing + the proxy (nginx / ng serve) to the backend
docs/              problem, ideation, product brief, ADRs, system design, API, demo
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
