# 4. Grant caps in the wallet, percentage rules in the app

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

MiPlante's promise is that each sale pays a percentage to the merchant's obligations: for example 15%
to a microcredit and 5% to savings. Our first sketch said the merchant would approve "a grant with
percentage rules".

Open Payments grants cannot express that. An outgoing-payment grant limits a **fixed amount**
(`debitAmount` or `receiveAmount`), optionally per **repeating interval** (`R/<start>/P1D`), for one
wallet. There is no notion of "a share of incoming payments".

## Decision

We split the responsibility between the wallet and the app.

- **The wallet enforces the safety cap.** At onboarding, the merchant approves one interactive
  outgoing-payment grant with `limits.debitAmount` equal to their daily cap and `limits.interval`
  equal to `R/<onboarding time>/P1D`. The wallet's authorization server rejects any debit beyond it.
- **MiPlante applies the percentages.** When a sale completes, the allocation engine computes each
  rule's share of that sale, and the app creates one outgoing payment per rule under the grant.
- **The two layers work together.** Before settling, the app reads how much of the cap was already
  spent in the current interval and reduces allocations to fit. If that read fails, the wallet's
  limit still holds.

## Consequences

- The merchant's protection does not depend on our code being correct: even a bug cannot debit more
  than the daily cap they approved, and they can revoke the grant from their wallet.
- Percentages, priorities and debt balances can change without asking for a new consent, as long as
  they stay within the cap.
- Collections follow sales: no sale means no outgoing payment, so nothing is collected on a day
  without sales.
- The cap is per rolling day starting at onboarding time, not per calendar day. We show the merchant
  what has been spent in the current interval.
- The merchant must hold enough balance for the split. Because the split runs right after a payment
  arrives in the same wallet, the money is there.
