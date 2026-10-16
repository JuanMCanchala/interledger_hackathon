# AI Usage Disclosure

Living document: we update it as the project evolves during the Open Payments Hackathon (Ruta N, Medellín, October 16–17, 2026).

## Tools Used

- Claude Code (Anthropic), model Claude Opus 5.5, including research sub-agents with web search.

## Where and How We Used AI

### 1. Research and ideation (no code)

- Used Claude Code to read the official hackathon guides and to research past Interledger hackathon winners, the sponsors of this edition, and winners of similar fintech hackathons.
- Claude Code launched three research sub-agents with web search and summarized their findings into project ideas.
- Prompts: [`prompts/00-setup-and-research.md`](prompts/00-setup-and-research.md).

### 2. Repository setup

- Used Claude Code to create this repository, the `main`, `prod`, `qa` and `dev` branches, the empty `README.md`, this file and the `prompts/` folder.
- Prompts: [`prompts/00-setup-and-research.md`](prompts/00-setup-and-research.md).

### 3. Application code

- `frontend/`: Claude Code scaffolded the Angular + GSAP PWA and wrote the landing page from the team's brief and brand kit. It also extracted the vector logo and the doodles from `Recursos Front/`.
- Integration of the landing (ADR 0011): Claude Code replaced the Next.js scaffold with the Angular app, wrote the nginx and `ng serve` proxies to the backend, kept the service worker away from the wallet callbacks, and linked the landing to the real app.

## What We Did Ourselves

- _To be completed._

## Files Written With Little or No AI

- None yet: no application code has been written.

## Prompt Log

See [`prompts/`](prompts/): one file per area of work, with the exact text of every prompt.
