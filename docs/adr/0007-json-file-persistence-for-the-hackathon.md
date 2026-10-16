# 7. JSON file persistence for the hackathon

- **Status:** Superseded by [ADR 0010](0010-postgresql-through-prisma-with-atomic-transitions.md)
- **Date:** 2026-10-16

## Context

We must keep merchants, sales, payments and grants, including access tokens, across server restarts
during the demo. Setting up and operating a database costs time we would rather spend on the product,
and the demo runs a single instance on a laptop.

## Decision

A small `Store` keeps all records in memory and writes them atomically to `data/store.json` after
every change (write to a temporary file, then rename). The file is created with mode `0600` and the
`data/` folder is in `.gitignore`. Tests use the same `Store` without a file.

## Consequences

- No infrastructure: `npm run dev` is enough, and restarts keep state.
- Access tokens are stored unencrypted on the local disk. That is acceptable for the test network, but
  not for production.
- One process only, no concurrent writers, and the whole file is rewritten on each change; this is fine
  for hundreds of records.
- The path to production is to replace `Store` with PostgreSQL behind the same methods, encrypt tokens
  at rest, and move settlement locks to the database.
