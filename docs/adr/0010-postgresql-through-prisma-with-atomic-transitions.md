# 10. PostgreSQL through Prisma, with atomic state transitions

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

[ADR 0009](0009-adopt-nextjs-nestjs-prisma-and-postgresql-stack.md) chose PostgreSQL and Prisma, but
the server still kept everything in a JSON file ([ADR 0007](0007-json-file-persistence-for-the-hackathon.md)).
That store was synchronous, so a read-modify-write could never be interrupted. Once storage is a
network database every call is asynchronous, and three races the file store hid become real:

1. **Double settlement.** Several polls of the same paid sale could each start a split. The
   in-process lock from [ADR 0006](0006-settle-sales-by-polling-idempotently.md) only helps inside one
   process.
2. **Settlement reset.** A poll reads a sale, waits for the wallet, then writes the whole record back
   as `paid` with its settlement `pending`. If another poll started the split meanwhile, that stale
   write reopens it and the sale is split again. We reproduced this against PostgreSQL: eight
   concurrent polls produced four splits.
3. **Lost repayments.** Two sales of the same merchant settling at once could both read a debt
   balance and write it back, so one repayment would be lost.

## Decision

- **A `Store` port** (`src/storage/store.ts`) with two adapters: `PrismaStore` (PostgreSQL 16 through
  Prisma 7 and the `pg` driver adapter) in the server, and `MemoryStore` in unit tests.
- **Relational schema** (`prisma/schema.prisma`, migrations in `prisma/migrations`): merchants, rules,
  sales and settlement items as columns, with money as `BIGINT` minor units next to its asset. Open
  Payments amounts that may be in another currency, and secrets (interaction, tokens), go in `JSONB`
  columns.
- **State transitions are single conditional `UPDATE`s**, never read-modify-write:
  - `claimSettlement`: `pending → running` only while the sale is `paid` and still `pending`. Whoever
    gets the row splits the sale; everyone else stops. This replaces the in-process lock.
  - `transitionSale`: changes only the customer-payment columns, only from an expected status, and
    never touches the settlement.
  - `recordRepayment`: `repaid = repaid + x`, `outstanding = GREATEST(outstanding - x, 0)` in one
    statement.
- **The schema is managed with migrations.** The backend container runs `prisma migrate deploy` on
  start.

## Consequences

- A sale is split exactly once even across several server instances. That resolves the single-instance
  caveat of ADR 0006.
- Unit tests stay fast and offline on `MemoryStore`. `tests/prismaStore.test.ts` runs the same
  scenarios against a real PostgreSQL when `TEST_DATABASE_URL` is set, and CI provides one.
- Whole-record saves (`saveSale`, `saveMerchant`) are still last-write-wins. That is safe because each
  sale has one writer at a time after the claim, but any new concurrent write path should get its own
  conditional update.
- If the process dies in the middle of a split, the sale stays `running` with the items sent so far.
  Resuming it is still manual.
- The JSON store and `DATA_FILE` are gone. Data in an old `data/store.json` is not migrated.
