# 5. Integer money, basis points and merchant-favorable rounding

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Open Payments amounts are strings of integer **minor units** plus an asset scale (`"1250"` with scale
2 is 12.50). Splitting a sale by percentages produces fractions. Floating-point arithmetic would
eventually create or lose cents, and COP amounts get large.

## Decision

- **All money is integer minor units held in `BigInt`**, converted from and to decimal strings only at
  the edges (`src/shared/money.ts`).
- **Shares are integer basis points** (1 bp = 0.01%, 10,000 bp = 100%). The API accepts percentages
  with at most two decimals and converts them to basis points.
- **Each allocation is rounded down**: `floor(sale × bps / 10,000)`. Every remainder stays with the
  merchant, and the merchant's share is computed as `sale − Σ allocations`, so the parts always add up
  to the sale exactly.
- **Debt allocations never exceed the outstanding balance**, and **all rules together can take at most
  50%** of a sale (5,000 bp): the merchant always keeps the majority.
- **Rules are applied in the merchant's order**, which is also their priority when the daily cap runs
  out.

## Consequences

- No cent is created or lost; the split of 10,000 COP is exactly 8,000 + 1,500 + 500.
- Rounding always favors the merchant, which matches the product's promise.
- Very small sales can produce zero-value allocations; those are skipped, not sent.
