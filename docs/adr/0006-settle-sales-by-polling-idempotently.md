# 6. Settle sales by polling, idempotently

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

The split must run once, and only once, after the customer's payment has actually arrived. Open
Payments has no webhooks for client applications: webhooks in Rafiki go to the account servicing
entity (the wallet provider), not to apps like ours. The only way to learn that a payment completed
is to read the incoming payment.

The customer may also close the browser right after approving, so we cannot rely on their page to
drive settlement.

## Decision

- **Two triggers, one code path:**
  - every `GET /api/sales/:id` (the merchant's and the customer's screens poll it) refreshes the
    payment;
  - a background sweeper does the same every few seconds for open sales.
- **A sale is paid when its incoming payment is completed**, or when it has received the full amount.
- **Settlement is idempotent.** A sale moves from `pending` to `running` to `done` (or `skipped`), and
  that state is written before any money moves. An in-process lock also prevents two concurrent
  settlements of the same sale.
- **Callbacks are idempotent too.** Reloading a consent callback never continues a grant twice or pays
  twice.

## Consequences

- Settlement happens within seconds of the payment arriving, even if nobody keeps a page open.
- Polling costs a few extra requests to the wallet. That is fine at hackathon scale; a production
  version would back off, batch, and use provider notifications where they exist.
- The in-process lock assumes a single instance (see
  [ADR 0007](0007-json-file-persistence-for-the-hackathon.md)). Several instances would need a
  database-level lock or a queue.
