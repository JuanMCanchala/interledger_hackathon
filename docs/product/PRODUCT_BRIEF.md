# MiPlante product brief

> **MiPlante splits every sale in real time, so micro-merchants repay suppliers and microcredit in
> proportion to what they actually sell.** If there are no sales today, nothing is collected today.

_Plante_ is Colombian slang for the working capital a small business runs on.

## Actors

| Actor                  | Who                                                                       | What they get                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Merchant**           | A shopkeeper, barber or street vendor with an Open Payments wallet        | Obligations paid automatically and proportionally, an emergency fund that grows by itself, and an income record |
| **Customer**           | A neighbor who pays with their own wallet, from any provider              | A normal QR payment, with consent in their own wallet                                                           |
| **Lender or supplier** | A microcredit institution, a cooperative, or a supplier selling on credit | Repayment that follows real sales, so it can lend without collateral or collectors                              |

Illustrative persona: _Rosa runs a shop in a hillside neighborhood of Medellín. She sells about
300,000 COP a day in small amounts. Her supplier comes every Monday, and last month a slow week
pushed her to borrow from a gota a gota lender._

## How it works

1. **Set up once.** The merchant enters their wallet, their obligations (for example a microcredit
   repaid with 15% of each sale until 300,000 COP are covered) and their savings (5% of each sale),
   plus a **daily cap** on deductions. They approve it once in their own wallet. The approval is an
   Open Payments grant that can never debit more than the daily cap and can be revoked at any time.
2. **Sell.** The merchant types the amount; the screen shows a QR. The customer scans it, enters
   their wallet and approves the payment in their wallet.
3. **Split.** When the payment arrives, MiPlante applies the rules: 10,000 COP becomes 8,000 for the
   merchant, 1,500 for the microcredit and 500 for the emergency fund, each one an outgoing payment
   from the merchant's wallet under the approved grant.
4. **See.** The dashboard shows today's sales, how much went to each obligation, how much of each
   debt is left, the emergency fund and a seven-day income history.

## Promises to the merchant

- **No sales, no collection.** Deductions only happen as a share of a real sale.
- **Never above the cap.** The wallet itself rejects any debit beyond the daily cap the merchant
  approved, even if MiPlante had a bug.
- **Always the majority.** Rules can take at most 50% of a sale; the rest is always the merchant's.
- **Revocable.** The merchant can cancel the authorization from their wallet whenever they want.

## Hackathon scope

**In:** merchant onboarding with a daily-capped grant; QR checkout paid from any test wallet;
automatic split into debt and savings rules; debt balance tracking; dashboard with today's totals
and a seven-day history; a developer sandbox for the raw Open Payments flows.

**Out (roadmap):**

- Lender-side portal and loan origination.
- A shareable, verifiable income passport.
- Cash-in and cash-out at banking agents (_corresponsales_).
- WhatsApp and voice interfaces.
- A production database and multi-instance deployment.

## Assumptions to validate

- Merchants accept automatic deductions when they are proportional and capped. This is the core
  trust question, the same one the Interledger Foundation and Oxford study in Medellín.
- Lenders price revenue-based repayment below informal credit once repayment follows real sales.
- Customers' wallets can pay the merchant's wallet through Open Payments. This works on the
  Interledger test network today; in production it depends on Colombian providers adopting the
  standard.

## Demo story (five minutes)

1. Rosa's problem: a fixed installment on a bad week, and the _gota a gota_ lender.
2. Onboarding: rules, daily cap, one approval in her wallet.
3. A customer pays 10,000 COP by QR. The four Open Payments steps appear on screen.
4. The sale splits itself: 8,000 / 1,500 / 500. The microcredit balance goes down.
5. The promise: no sales, no collection, never above the cap.

The full script and recording checklist are in [`../DEMO.md`](../DEMO.md).
