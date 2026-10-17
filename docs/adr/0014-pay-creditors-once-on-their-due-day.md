# 14. Pay creditors once, on their due day

- **Status:** Accepted
- **Date:** 2026-10-17
- **Amends:** ADR 0013 (when a debt's share leaves the merchant's wallet)

## Context

Sending a debt's share with every sale gave the supplier or the lender dozens of small transfers a
day. Creditors do not work that way: they expect the month's payment, in one go, by a date they
agreed with the shopkeeper.

## Decision

- **Each sale reserves, it does not send.** A debt's share is set aside as a `reserved` settlement
  item. The money stays in the merchant's wallet, and MiPlante keeps the count. The monthly quota
  still limits how much each month reserves.
- **One payout on the due day.** Each debt rule has a due day (1–28, editable; the 28th if not
  given, a day every month has). On that day a scheduler sends the creditor everything reserved,
  as one outgoing payment under the merchant's monthly-capped grant, and records a payout.
- **Savings are unchanged.** They are the shopkeeper's own money and still leave with each sale.
- **Early payments, and the demo.** `POST /api/merchants/:id/payouts` pays one debt now
  (`manual`), or every debt as if its due day had come (`due-date`). The demo and the panel's
  "Simular fecha de pago" use the second one, so the monthly payment can be shown on stage. A
  due-day payout counts for its month, so the scheduler does not pay that debt twice.
- **Repaid on arrival.** A debt's `repaid` and `outstanding` change when its payout completes,
  not when a sale reserves. A payout that cannot be sent leaves the money reserved for the next
  try.
- **Reserved money already counts.** It reduces the room left in the monthly cap for later sales,
  and it counts against the debt's balance, because it will leave under the same grant.

## Consequences

- The creditor gets one payment a month, in a predictable amount, on the day it expects.
- The merchant's wallet holds the reserved money until the due day. If the merchant spends it, the
  payout fails, the panel shows it and the money stays counted as reserved. A separate savings-like
  wallet would protect it, at the cost of a second consent and a transfer per sale.
- Payout locks are per server process. That is enough for the single backend instance of the
  hackathon; more instances would need a database claim, like settlements have (ADR 0006).
