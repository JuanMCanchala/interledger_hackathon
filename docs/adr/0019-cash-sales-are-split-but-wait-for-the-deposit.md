# 19. Cash sales are split, but their shares wait for the deposit

- **Status:** Accepted
- **Date:** 2026-10-17
- **Builds on:** ADR 0014 (debts paid on their due day), ADR 0015 (failed payouts wait for review),
  ADR 0017 (GlorIA)

## Context

Many customers still pay in cash. Open Payments only moves money between wallets: it cannot see
the bills in the drawer, and MiPlante cannot send a share of money that is not in the wallet.
Leaving cash out would make the month look smaller than it is and keep the quotas and savings from
advancing. Splitting cash as if it were in the wallet would send money that may not be there.

Turning cash into wallet money (cash-in) is done by the wallet's provider through its own channels
(in Colombia, banking agents or a top-up at a store), not by Open Payments.

## Decision

- **A cash sale counts and is split, like any sale.** It is recorded as paid at once (in Vender
  with "En efectivo", or telling GlorIA "vendí 15 mil en efectivo"), adds to the day's and month's
  sales, the goal and the real profit, and the shop's rules split it: its shares count toward each
  quota.
- **Its shares stay in cash** (`cash`): nothing is sent. Held cash already counts against the
  monthly cap and against what a debt still owes, as reserved money does.
- **Only the shares need depositing.** The till shows "Por consignar", the sum of the held shares:
  of a $20.000 cash sale with 15% for a credit and 5% for savings, $4.000. The rest is the shop's
  and can stay in the drawer.
- **A deposit releases the oldest shares first, whole.** When the shopkeeper says they deposited
  (in Inicio, or "consigné 50 mil" to GlorIA), savings shares leave at once through Open Payments
  under the monthly grant, and debt shares become reserved for their due day. If that debt's due-day
  payment already went out this month, the released share is paid right away instead of waiting a
  month. What a deposit does not cover is kept as credit for the next shares.
- **The deposit is declared, not verified.** Open Payments cannot read a balance. If the money is
  not there, a share fails, and a due-day payment that fails waits for review (ADR 0015), where
  "mark as paid" also covers a creditor paid in cash.
- A cash sale has no QR: it never shows on the counter display (ADR 0018) and does not replace the
  QR sale waiting there.

## Consequences

- The month shows everything the shop sold, and quotas and savings advance with cash too, without
  MiPlante ever sending money the wallet may not have.
- The shopkeeper has one simple number to act on, and only deposits what must leave.
- A deposit the shopkeeper declares but did not make shows up as failed shares or a failed payout,
  not as missing money. A deposit verified by an incoming payment to the shop's wallet (a payment
  request the cash-in agent pays) would remove that gap; it needs the wallet provider's cash-in to
  pay a payment request.
