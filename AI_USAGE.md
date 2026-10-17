# AI Usage Disclosure

MiPlante was built by a five-person team at the Open Payments Hackathon (Ruta N, Medellín,
October 16–17, 2026). AI coding assistants wrote most of the code, tests and documentation. The
team chose the problem and the product rules, steered every change through prompts, and reviewed
and tested everything that reached `main`.

## Tools used

| Tool                    | Model           | Used by                                                | Used for                                                                            |
| ----------------------- | --------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Claude Code (Anthropic) | Claude Opus 5.5 | Juan Manuel Canchala, Brayan Zuluaga, Isabella Pacheco | Code, tests, documentation and deployment, plus research and code-review sub-agents |
| Google Antigravity      | Gemini 4 Argon  | Brayan Zuluaga                                         | Ideation, the first architecture and the Prisma/PostgreSQL persistence              |

While building the design system, Claude Code also followed two community agent skills,
`ui-ux-pro-max` and `fronted-design` (see `design-system/miplante/MASTER.md`). They are not part of
the repository.

**AI inside the product.** GlorIA, the shopkeeper's assistant in the till, calls DeepSeek V4.1
Flash at runtime when `DEEPSEEK_API_KEY` is set. It reads the shop's own data and prepares actions
that the shopkeeper confirms; it never moves money ([ADR 0017](docs/adr/0017-gloria-an-assistant-that-reads-and-prepares-but-never-moves-money.md)).

## Where and how we used AI

| Area                      | Where                                                                                                       | What the AI did                                                                                                                                                                                                                                                                                                                                                         | What the team did                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Open Payments integration | `backend/src/openPayments/`                                                                                 | Built the layer before the idea was chosen ([ADR 0002](docs/adr/0002-build-the-open-payments-layer-first.md)): incoming payments, quotes, interactive grants with the GNAP finish-hash check, token rotation and capped recurring grants. Later, each sale as a payment request in its QR ([ADR 0012](docs/adr/0012-each-sale-is-an-open-payments-payment-request.md)). | Created the test wallets and developer keys, approved consents in the wallet, and paid real sales between the team's wallets. |
| Backend and domain        | `backend/src/` (`domain`, `merchants`, `storage`, `auth`, `http`, `assistant`)                              | The allocation engine (integer money, merchant-favorable rounding), sales and settlement, monthly quotas, due-day payouts, the emergency fund, cash sales, accounts and GlorIA's tools. Gemini drafted the first architecture and the persistence design.                                                                                                               | Set the product rules: shares, monthly caps, quotas, due days, and what GlorIA may and may not do.                            |
| Frontend                  | `frontend/`                                                                                                 | The Angular and GSAP landing from the team's brief and brand kit, every app page in Angular, the till, the one-question-per-screen onboarding, and GlorIA's chat and voice.                                                                                                                                                                                             | Brand, copy and UX direction (multi-step forms, plain Spanish for shopkeepers), checked on phone-sized screens.                       |
| Documentation             | `README.md`, `docs/` (ADR 0001–0019, system design, API, demo, deployment guides)                           | Drafted from the team's decisions and kept in sync with the code.                                                                                                                                                                                                                                                                                                       | The decisions recorded in the ADRs.                                                                                           |
| Deployment                | `docker-compose*.yml`, the Dockerfiles, `frontend/nginx.conf.template`, `docs/DEPLOY.md`, `docs/COOLIFY.md` | Docker set-up, the nginx proxy, deploys to Railway and Coolify.                                                                                                                                                                                                                                                                                                         | The domain's DNS, the Coolify server, and secrets entered only as platform variables.                                         |
| Quality                   | `backend/tests/`, `frontend/**/*.spec.ts`                                                                   | Tests written with each feature, independent review sub-agents, and browser runs of every screen.                                                                                                                                                                                                                                                                       | Decided what was good enough to reach `main`.                                                                                 |

## How we verified the AI's work

- **Automated checks on every push (CI):** strict TypeScript, 188 backend tests (including the
  storage contract against a real PostgreSQL), and the Angular tests and production build.
- **Review before production:** independent review sub-agents read each batch of changes, and
  every finding was reproduced with a failing test before it was fixed. Bugs that never reached
  production this way:
  - anyone holding a sale link could use the shop's grant through the public sandbox routes
    ([8ad5e0f](https://github.com/JuanMCanchala/interledger_hackathon/commit/8ad5e0f));
  - the due-day pass and "pay now" could pay a creditor twice ([13602ef](https://github.com/JuanMCanchala/interledger_hackathon/commit/13602ef));
  - two sales settling at once paid a monthly quota twice ([eb900a1](https://github.com/JuanMCanchala/interledger_hackathon/commit/eb900a1));
  - a double tap on "Create account" answered 500 ([b597fc6](https://github.com/JuanMCanchala/interledger_hackathon/commit/b597fc6));
  - expired payment requests were polled for a day, until new sales failed ([c54cfad](https://github.com/JuanMCanchala/interledger_hackathon/commit/c54cfad)).
- **The real flow, end to end:** sales paid between the team's wallets on the Interledger test
  network, browser runs of every screen at 390 and 1440 px against the production images, and smoke
  tests on the live domain after each deploy.

## What we did ourselves

- Chose the problem and the idea on the team's board (MiPlante was Brayan's idea), and defined the
  product rules.
- Set up the Interledger test wallets, the developer keys, the domain and the servers.
- Steered every change through prompts and reviewed the result before it reached `main`.
- Kept secrets out of the repository: keys live only in local `.env` files and platform variables.

## Files written with little or no AI

None of the code or documentation: every source, test and documentation file was written with AI
assistance and reviewed by the team. Work done by hand happened outside the repository: creating
the wallets and keys, approving consents in the wallet, and configuring the domain.

## Key prompts

The full logs are in [`prompts/`](prompts/). These shaped the project the most (Juan's are quoted
in their refined version; the original wording is at the end of his log):

- **Open Payments first.** _"Mientras el equipo elige la idea, implementa la integración
  obligatoria de Open Payments como una capa independiente del producto…"_: the mandatory
  integration was built and tested before the idea was chosen. ([Juan](prompts/juan-canchala.md))
- **Each sale is a payment request.** _"Determina si una página de terceros puede aprovechar la
  sesión del test wallet para conocer las billeteras del cliente…"_: research that led to the QR
  that opens the customer's wallet on the sale's incoming payment (ADR 0012).
  ([Brayan](prompts/brayan-zuluaga/09-solicitud-de-pago-open-payments-en-el-qr.md))
- **A brand-aligned, multi-step app.** _"Asegúrate de un buen UX (ej: en lugar de formularios
  largos que requieren scroll, hazlo multistep)"_: the one-question-per-screen sign-up and
  onboarding. ([Isabella](prompts/isabella-pacheco.md))
- **No bug reaches production.** _"Antes de promover `dev` → `qa` → `prod`, audita cada lote de
  cambios del equipo… Reproduce cada hallazgo con una prueba que falle antes de corregirlo."_: the
  review gate described above. ([Juan](prompts/juan-canchala.md))
