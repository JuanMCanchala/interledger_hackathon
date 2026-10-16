# 2. Build the Open Payments layer before choosing the idea

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Every submission must show a working Open Payments flow: payment request, authorization (user
consent), execution and successful completion. Projects without it are not eligible. The organizers'
own advice is to make one payment work end to end before building anything else.

The flow is the riskiest part of the build: interactive grants (GNAP), redirect callbacks, hash
verification, quotes that expire and access tokens that need rotation. At the same time, the team was
still choosing between seven ideas, and all of them needed the same primitives: a one-off payment,
and a grant the user approves once with a limit and an interval.

## Decision

While the team chose the idea, we built an idea-agnostic Open Payments layer on the official
JavaScript SDK (`@interledger/open-payments` 7.4.0). It offers:

- **One-off payments:** incoming payment → quote → interactive grant → outgoing payment → completion.
- **Mandates:** an interactive outgoing-payment grant with a debit limit and an optional repeating
  interval, then any number of payments under it without asking for consent again.
- **Split charges:** several payments to different wallets under one mandate.

It sits behind a small HTTP API and a sandbox page that shows the four steps the demo must prove.

## Consequences

- The mandatory, riskiest part was done and tested before any product code, and it did not depend on
  which idea won.
- MiPlante needs no new Open Payments work: onboarding is a mandate with a daily interval, a sale is a
  one-off payment, and the split is a set of mandate charges.
- The layer is generic, so a few concepts (for example `amountType`) exist for other ideas and are not
  used by MiPlante.
