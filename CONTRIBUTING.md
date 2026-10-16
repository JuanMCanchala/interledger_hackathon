# Contributing

## Branches

| Branch | Purpose                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `dev`  | Integration. Day-to-day work lands here, directly or through short-lived `feat/…` / `fix/…` branches.                                      |
| `qa`   | What was tested end to end against the Interledger test wallet.                                                                            |
| `main` | The submission: default branch, what judges and reviewers see. **Everything must be merged here before the code freeze (Saturday 11:00).** |
| `prod` | Mirrors `main` for the deployed demo.                                                                                                      |

Promote with fast-forward merges: `dev → qa → main → prod`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) with a scope:

```
feat(sales): split every paid sale automatically under the daily cap
fix(open-payments): accept unpadded interaction hashes
docs(adr): record the settlement decision
test(domain): specify the revenue split rules
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Scopes: `domain`, `merchants`, `sales`,
`open-payments`, `web`, `http`, `product`, `adr`.

Keep commits small and in the order the work was thought through: decision, then test, then code.

## Before pushing

- [ ] `npm run typecheck` and `npm test` pass.
- [ ] New behavior has tests. Domain logic is pure and tested without network.
- [ ] Decisions that are costly to reverse have an ADR in `docs/adr/`.
- [ ] Docs that describe the change are updated: `SYSTEM_DESIGN.md`, `API.md`.
- [ ] No secrets: `private.key`, `.env` and `data/` stay out of git.
- [ ] AI prompts used for the change are kept locally in `/prompts`; they are published before the
      final submission (hackathon AI policy).

## Conventions

- **Language:** code, comments and docs in English; user-facing copy in Spanish.
- **TypeScript:** strict mode. Validate every external input with zod at the edge.
- **Money:** integer minor units in `BigInt` (`src/shared/money.ts`), never floating point.
- **Formatting:** Prettier defaults (double quotes, semicolons, 2 spaces).
- **Layers:** `domain` and `shared` depend on nothing else in the app; `merchants` uses `domain`,
  `openPayments` and `storage`; `http` only calls services.
- **UI:** render server data with `textContent`, never `innerHTML`.
