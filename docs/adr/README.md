# Architecture decision records

We record every significant architecture decision as a short ADR, following Michael Nygard's format:
**Context → Decision → Consequences**. ADRs are immutable once accepted; a later ADR supersedes an
earlier one instead of editing it.

| ADR                                                           | Title                                                       | Status   |
| ------------------------------------------------------------- | ----------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)                 | Record architecture decisions                               | Accepted |
| [0002](0002-build-the-open-payments-layer-first.md)           | Build the Open Payments layer before choosing the idea      | Accepted |
| [0003](0003-modular-monolith-in-node-and-typescript.md)       | Modular monolith in Node.js and TypeScript                  | Accepted |
| [0004](0004-grant-caps-with-percentage-rules-in-the-app.md)   | Grant caps in the wallet, percentage rules in the app       | Accepted |
| [0005](0005-integer-money-and-merchant-favorable-rounding.md) | Integer money, basis points and merchant-favorable rounding | Accepted |
| [0006](0006-settle-sales-by-polling-idempotently.md)          | Settle sales by polling, idempotently                       | Accepted |
| [0007](0007-json-file-persistence-for-the-hackathon.md)       | JSON file persistence for the hackathon                     | Superseded by 0010 |
| [0008](0008-web-client-served-by-the-api.md)                  | Mobile-first web client served by the API                   | Superseded by 0009 |
| [0009](0009-adopt-nextjs-nestjs-prisma-and-postgresql-stack.md) | Adopt Next.js, NestJS, Prisma ORM, and PostgreSQL stack   | Accepted |
| [0010](0010-postgresql-through-prisma-with-atomic-transitions.md) | PostgreSQL through Prisma, with atomic state transitions | Accepted |

To add one, copy the structure of an existing ADR, take the next number and add it to this table.
