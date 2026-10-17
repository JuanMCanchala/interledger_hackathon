# 15. The due day completes the quota, and a failed payout waits for review

- **Status:** Accepted
- **Date:** 2026-10-17
- **Amends:** ADR 0014 (what the due-day payout sends, and what happens when it fails)

## Context

ADR 0014 paid each creditor what the month's sales had reserved, on the debt's due day. Two things
did not match how a shop pays its creditors:

- A slow month reserved less than the agreed quota, so the supplier got a partial payment, when what
  it expects is the agreed amount on the agreed day.
- A payout that failed was tried again every minute. A failure can be a timeout after the money did
  leave, so trying again can pay the creditor twice; and an empty wallet just piled up failures.

## Decision

- **The due day sends the month's quota.** It sends what was reserved and, if that is short, the rest
  from the shop's profit (the rest of the money in the same wallet). It never sends more than the
  quota, what the debt still owes, or what the monthly cap still allows once every reserved share
  has left. The profit part is recorded on the payout (`topUp`) and counts as covering the quota, so
  the month's later sales take nothing for that debt. "Pagar ahora" still sends only what is
  reserved.
- **A failed payout is never retried on its own.** A due-day payout counts as that month's even when
  it failed, so the scheduler does not send it again. A payout the wallet never confirmed turns into
  a failure after ten minutes.
- **The shopkeeper resolves each failure.** They check the creditor's wallet and either retry it,
  which sends a new payout worked out again, or mark it paid if the money did arrive, which sends
  nothing. Each failure stays in the notifications until it is resolved.
- **Notifications are computed, not stored.** The dashboard works them out from the payouts, the
  rules and the consent: failed payouts to review, the creditors due in the next three days with what
  is reserved and what will come from profit, the payouts sent in the last week, and a missing
  consent or cap approval. They cannot disagree with the money. What was already seen is kept per
  device in the browser.

## Consequences

- Creditors get the agreed amount on the agreed day, as long as the wallet has the money and the cap
  has room. The reminder before the due day tells the shopkeeper how much will come from profit.
- Nothing is ever paid twice because of a retry. The price is that a failed payout needs the
  shopkeeper to act on it.
- The reminders show in the panel only. A reminder on the phone while the app is closed would need
  push notifications (a service worker and a push service), which are not built.
