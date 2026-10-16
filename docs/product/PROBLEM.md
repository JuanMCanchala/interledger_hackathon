# Problem statement

## Who has the problem

Colombian micro-merchants who live day to day: neighborhood shopkeepers (_tenderos_), barbers,
street vendors and other self-employed workers. They sell many small amounts every day, keep all the
money in a single pocket, and have obligations that do not care how the day went.

## The cash-flow trap

1. **Income is daily and volatile.** A good Saturday and a rainy Tuesday can differ several times
   over, and everything lands in the same pocket, mixed with household spending.
2. **Obligations are fixed.** Supplier invoices and loan installments arrive on fixed dates for fixed
   amounts, whether or not there were sales.
3. **A bad day breaks the chain.** When the supplier arrives after a slow week, the merchant has
   nothing set aside. Formal credit asks for payslips and history the merchant does not have.
4. **The fallback is predatory.** The informal _gota a gota_ lender is fast and asks no questions,
   but charges interest far above the legal maximum and collects aggressively.

The result is a merchant who works every day and still ends up with less capital and more debt.

## Context

| Signal                                              | Figure                                                                                                                    | Source                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Cash is still the main way people pay               | 66% of payments in 2026, down from 79% in 2023                                                                            | [ENTER.CO](https://www.enter.co/?p=587712)                                                                                                     |
| Digital money rarely leaves its own institution     | 95% of digital transfers stay within the same bank                                                                        | [ENTER.CO](https://www.enter.co/?p=587712)                                                                                                     |
| Instant payments already exist                      | Bre-B: 116 million keys and 36 million clients in its first year (Oct 2025 – Oct 2026)                                    | [El País](https://www.elpais.com.co/economia/en-su-primer-ano-bre-b-mueve-262-billones-y-alcanza-116-millones-de-llaves-en-colombia-0604.html) |
| Trust, not access, is the open question in Medellín | Interledger Foundation and the University of Oxford are studying how trust drives adoption of digital finance in the city | [FF News](https://ffnews.com/news/interledger-foundation-and-university-of-oxford-launch-financial-inclusion-research-in-colombia)             |

Figures about the size of the micro-business sector and the cost of _gota a gota_ loans are being
verified before they are used in the pitch.

## Why current options fall short

- **Fixed-installment microcredit** charges the same amount on a day with no sales as on a good day.
- **Instant payments (Bre-B)** move money fast, but every transfer is still manual: nothing pays the
  supplier or the lender in proportion to what was actually sold.
- **Revenue-based repayment** (a percentage of each sale goes to the lender) exists in some payment
  platforms, but only for merchants who accept payments inside that platform's closed ecosystem.

## The opportunity

Open Payments lets a merchant authorize, once, a **capped, revocable, interval-limited debit** from
their own wallet, whatever provider holds it. That makes it possible to repay in proportion to real
sales, across wallets: _if there are no sales today, nothing is collected today_, and never more than
the daily cap the merchant approved.

## What success looks like

- The merchant repays suppliers and microcredit without ever being charged on a day without sales.
- An emergency fund grows automatically, so a bad week does not push the merchant to _gota a gota_.
- Every sale leaves a verifiable income record the merchant can show to get formal credit.
