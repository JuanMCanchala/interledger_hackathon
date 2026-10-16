# MiPlante frontend

Angular PWA with GSAP: the landing and the brand's design system. It also puts the backend under the
same domain, so people, QR codes and wallet callbacks only ever use this URL (ADR 0011).

```bash
npm install
npm start        # http://localhost:3001, proxying the backend at http://localhost:3000
npm test
npm run build    # dist/frontend/browser
```

With Docker, `npm run docker:up` from the repository root runs `ng serve` (target `dev` of the
Dockerfile) next to the backend and PostgreSQL. The final stage of the Dockerfile is the production
image: nginx serving the build.

## Proxy to the backend

Everything that is not the landing lives in the backend: `/api/*` (including the wallets' consent
callbacks), `/onboard.html`, `/merchant.html`, `/pay.html` and `/sandbox.html`, and their assets under
`/css/*`, `/js/*` and `/img/*` (plus `/favicon.svg`). Backend assets never go at the root: `ng serve`
publishes its own `/styles.css` and would shadow them.

| Where | File | Backend address |
| --- | --- | --- |
| `ng serve` | `proxy.conf.mjs` | `BACKEND_INTERNAL_URL`, default `http://localhost:3000` |
| Production (nginx) | `nginx.conf.template` | `BACKEND_INTERNAL_URL` at container start; `PORT` too |

Keep both lists in sync when the backend gets a new page. `ngsw-config.json` keeps the service worker
from answering those paths with the landing.

## Structure

- `src/app/core`: motion setup (GSAP plugins, reduced-motion handling) and money formatting.
- `src/app/shared/brand`: logo (vector paths taken from the brand PDF) and doodles.
- `src/app/shared/ui`: the cursor follower.
- `src/app/features/<feature>`: one folder per feature, holding its own domain logic and UI.
- `src/styles.scss`: design tokens (`--monte`, `--lima`, `--papel`…), type, `.button` and
  `.button-ghost`.
