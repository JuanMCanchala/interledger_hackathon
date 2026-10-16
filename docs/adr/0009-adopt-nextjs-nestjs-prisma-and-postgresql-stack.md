# 9. Adopt Next.js, NestJS, Prisma ORM, and PostgreSQL for the Full-Stack Architecture

Date: 2026-10-16

## Status

Accepted (supersedes [ADR 0003](0003-modular-monolith-in-node-and-typescript.md), [ADR 0007](0007-json-file-persistence-for-the-hackathon.md), and [ADR 0008](0008-web-client-served-by-the-api.md) for the target architecture).
Its frontend and backend frameworks are superseded by [ADR 0011](0011-angular-landing-behind-one-domain-with-an-express-backend.md):
the frontend is Angular and the backend stayed on Express. The three containers, Prisma and
PostgreSQL stand.

## Context

After validating the core Open Payments protocol flows and defining the **MiPlante** product architecture with the 5-member team, we decided to standardize the project's technology stack around enterprise-grade TypeScript frameworks and relational persistence suitable for concurrent financial transactions and rich interactive visualizations during the demo:

1. **Frontend:** We need reactive state updates for the merchant's live POS till, real-time split progress bars, and smooth QR checkout experiences across mobile and desktop devices.
2. **Backend:** We need clear module boundaries (`MerchantsModule`, `SalesModule`, `OpenPaymentsModule`), dependency injection, and structured request validation.
3. **Persistence:** Concurrent sale polling and multi-party split settlements (`Proveedor`, `Microcrédito`, `Ahorro`) benefit from ACID database transactions and typed relational queries rather than flat file locks.

## Decision

We adopt a fully containerized three-tier architecture running inside **Docker Desktop (`docker-compose.yml`)**:

1. **Container 1 — Frontend (`Next.js`):** Serves the merchant onboarding flow, POS till, customer QR checkout, and real-time split dashboard.
2. **Container 2 — Backend (`NestJS` + `Prisma ORM`):** Hosts the REST controllers, GNAP callback endpoints, domain allocation engine (`BigInt`), the `@interledger/open-payments` adapter module, and `PrismaService` for type-safe database access and transactional locks (`prisma.$transaction`).
3. **Container 3 — Database (`PostgreSQL 16`):** Runs a containerized PostgreSQL 16 instance with a persistent Docker volume to store `Merchant`, `Rule`, `Sale`, `SettlementItem`, `Mandate`, and `Payment` records reproducibly across all 5 team members' machines.

## Consequences

- **Clear separation of concerns:** Frontend (`Next.js`) and Backend (`NestJS`) communicate strictly over typed REST/JSON contracts while preserving the pure `BigInt` allocation domain logic.
- **Transactional guarantees:** `Prisma ORM` + `PostgreSQL` provide row-level locking and ACID guarantees when transitioning a sale's settlement from `pending` to `running` and `done`.
- **Team velocity:** All 5 team members can work in parallel across well-defined layers (Next.js UI components, NestJS Open Payments services, Prisma schema/migrations, and demo scenarios).
