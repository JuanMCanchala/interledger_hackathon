# 13. Monthly quotas under a monthly cap, and shopkeeper accounts

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Shopkeepers think about their obligations by the month: the supplier is paid monthly, and the
microcredit has a monthly installment. A daily cap (ADR 0004) did not match that. It also kept taking
shares after the month's installment was covered, money the shopkeeper would rather keep.

The till was also opened with a merchant ID kept on the device. Any other device needed the ID
typed in, and anyone with the link could open the till.

## Decision

- **The grant caps a calendar month.** The shop's interactive `outgoing-payment` grant keeps
  `limits.debitAmount`, now with `limits.interval` = `R/<1st of the month, 00:00 Bogotá>/P1M`.
  The wallet still enforces the cap, so N2 holds even if our code is wrong.
- **Each obligation has a monthly quota.** A debt rule takes its share of each sale until this
  month's quota is paid, counted from the shares settled since the 1st. After that its share stays
  with the shop until next month. A total balance (`outstanding`) is optional; when set, the debt
  also stops once it is paid off.
- **Savings have no quota** and always take their share, bounded only by the monthly cap.
- **The cap covers the quotas.** Onboarding and rule edits refuse quotas that add up to more than
  the monthly cap; the rest of the cap is room for savings.
- **Rules carry a free-text category** (Proveedores, Microcréditos, Ahorro, or the shop's own),
  with up to 10 rules, so a shop can have several suppliers or loans.
- **Shopkeepers have accounts.** They sign up with email and password. The password is stored only
  as a salted scrypt hash (`node:crypto`, no new dependency). A random 30-day session token is sent
  as a Bearer token. Each shop belongs to the account that registered it, and its routes answer
  `404` to any other account. The customer's routes stay public: paying needs no account.

## Consequences

- Once quotas are covered, every later sale that month is pure profit.
- `paidThisMonth` is computed per rule from settled items, not stored, so it cannot drift from the
  payments that actually happened.
- A shop that sells early in the month pays its obligations early. The cap and the quotas stop
  collection, never the calendar.
- Sessions are opaque random tokens in the database. They can be revoked by deleting the row, with
  no signing keys to manage. There is no password reset or email verification yet.
