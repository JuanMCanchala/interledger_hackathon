# 16. The emergency fund is the last resort, and only when the shopkeeper chooses it

- **Status:** Accepted
- **Date:** 2026-10-17
- **Builds on:** ADR 0015 (the due day completes the quota from profit; failed payouts wait for review)

## Context

On the due day a creditor gets the month's quota: what was reserved and, if that is short, the rest
from profit (ADR 0015). Profit can be short too, and then the payout fails because the shop's wallet
has no money. The shop usually still has money in its emergency fund, a savings rule's wallet in the
same account. Paying the supplier from it beats defaulting on the supplier or borrowing from a
lender at usurious rates.

Two constraints shape how:

- **Open Payments grants are per wallet address.** MiPlante's grant only covers the shop's wallet. To
  take money from the savings wallet it needs a second grant, on that wallet, approved by its owner.
  That the wallets share an account does not change this.
- **Open Payments cannot read a balance.** MiPlante does not know that profit is short before trying.
  It only learns it when the payout fails.

## Decision

- **The order is fixed:** what is reserved, then profit, then the emergency fund, which is the last
  thing touched.
- **The fund needs its own consent.** In Ajustes the shopkeeper approves a grant on one savings
  wallet, capped per month like the shop's. They pick which wallet when there are several.
- **The fund is used only when the shopkeeper chooses it, on a failed payout.** The failure's
  notification offers "use the emergency fund" next to retry and mark paid. Choosing it moves the
  payout's amount from the savings wallet to the shop's, and once that arrives the payout is sent
  again in full from the shop. The money goes through the shop so the creditor gets a single payment
  from it.
- **The fund's progress goes down by what was taken, once.** A move that fails says why, and the
  shopkeeper can choose the fund again.
- Like the shop's own grant, the emergency grant is not reachable through the sandbox's public
  mandate routes.

## Consequences

- A short month can still pay the supplier in full, and the shopkeeper always decides when the
  emergency fund is spent.
- Using the fund takes two payments (savings to shop, shop to creditor) and a second consent at setup.
- Nothing moves on its own. This keeps the rule from ADR 0015 that a failed payout is never retried
  automatically, since a failure can hide a payout that did arrive.
