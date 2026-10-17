# Demo and pitch script

Five minutes per round, with the demo inside them. The judges must see a working Open Payments flow
with its four steps: **payment request → authorization → execution → completion**.

## Before going on stage

- [ ] `npm run dev` is running and `npm run check:wallet` passes.
- [ ] The shop is registered and **active**: run `npm run demo:merchant` and approve the consent
      link once with the shop's account (`tienda-billeticos`). Sign in to the till as
      `demo@billeticos.co`. The demo starts from the till, not from onboarding.
- [ ] The splits are set to the story: 15% microcrédito and 5% ahorro (8,000 / 1,500 / 500 on
      10,000 COP). Change them from **Editar repartos** if a rehearsal left them different.
- [ ] Test balances are loaded: the customer can pay 10,000 COP or its USD equivalent.
- [ ] The phone reaches the server: same network, or a tunnel set in `PUBLIC_BASE_URL`.
- [ ] Two browser windows: the till on the laptop (`/merchant?id=…`) and the test wallet logged
      in as the customer on the phone.
- [ ] Backup: the recorded video of the full flow, in the repository or the team's Drive folder.

## Script

| Time      | Who                   | What to say and show                                                                                                                                                                                                                                                                                                                                       |
| --------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:45 | Problem               | Rosa runs a shop in Medellín. Sales come in small amounts, every day; the microcredit installment comes every week, fixed. One slow week and she ends up with the _gota a gota_ lender at 20% a month. 35.6% of the micro-businesses that asked for credit last year went there (DANE).                                                                    |
| 0:45–1:15 | Idea                  | MiPlante: every sale splits itself. A share repays her debts, a share goes to savings, the rest is hers. **If she sells nothing today, nobody collects today.**                                                                                                                                                                                            |
| 1:15–1:45 | Consent               | Show Rosa's rules, their monthly quotas and her monthly cap. She approved the cap **once**, in her own wallet, with Open Payments: the wallet will never let anyone debit more than the cap, and she can revoke it. The splits are hers: **Editar repartos** changes them without asking for consent again.                                                                    |
| 1:45–3:30 | Live demo             | Type 10,000 COP and show the QR: it is the sale's Open Payments payment request (request). The customer scans it, their wallet opens with the shop and the amount already filled in, and they **confirm in their own wallet** (authorization). The payment moves over Interledger (execution) and the till shows "¡Pagado!" (completion). The sale splits itself: **8,000 Rosa · 1,500 microcredit · 500 emergency fund**. The microcredit balance goes down. |
| 3:30–4:15 | Why Open Payments     | Revenue-based repayment already exists at Mercado Pago, Square and Shopify, but only for sales inside their closed platforms. With Open Payments it works between any wallets: the customer's, Rosa's and the lender's can each be at a different provider. Grants make the cap a rule that the wallet enforces, so Rosa does not have to trust the app.   |
| 4:15–5:00 | Impact and next steps | Lenders can lend against real sales instead of collectors. Next: verifiable income history for formal credit, cash-in at banking agents, WhatsApp.                                                                                                                                                                                                         |

## Recording the video (required upload)

Record the screen of the full flow, ideally with both the till and the phone visible:

1. The till creates the sale and shows the QR (**payment request**).
2. The customer's wallet asks for consent and the customer approves (**authorization**).
3. Back on the checkout, the steps tick through "Ejecución" (**execution**).
4. "¡Pago completado!" and the split appear on both screens (**completion**).

Upload it to the repository (`media/`) or to the team's Drive folder before **12:00 on Saturday**.

## Questions to expect

| Question                               | Answer                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why not Bre-B?                         | Bre-B moves money instantly, but every transfer is manual. MiPlante needs _programmable, capped, revocable_ debits across providers; that is what Open Payments grants are for. |
| Can MiPlante take more than it should? | No. The wallet enforces the monthly cap in the grant, the rules can take at most 50% of a sale, debts stop at their monthly quota, and the merchant can revoke at any time.             |
| Grants don't support percentages.      | Correct. The wallet enforces a fixed monthly cap; MiPlante applies the percentages and quotas per sale within it (ADR 0004, 0013).                                                                 |
| What if the payment fails halfway?     | Settlement happens only after the incoming payment completes, exactly once; a failed repayment is marked and the debt balance is not reduced (SYSTEM_DESIGN §9, §11).           |
| Who is the lender?                     | Any lender with an Open Payments wallet: a cooperative, a fintech, or a public program like Medellín's Banco Distrital _nanocréditos_.                                          |
