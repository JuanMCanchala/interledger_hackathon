# MiPlante frontend

Angular PWA with GSAP: the landing, sign-in, onboarding, merchant till, checkout and counter display.
It also puts the backend under the same domain, so people, QR codes and wallet callbacks only ever
use this URL (ADR 0011).

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

Only `/api/*` (including the wallets' consent callbacks) is proxied to the backend. Angular serves
the page routes, including `/onboard`, `/merchant`, `/pay` and `/sandbox`; nginx redirects legacy
`.html` links to those routes while preserving query parameters.

| Where | File | Backend address |
| --- | --- | --- |
| `ng serve` | `proxy.conf.mjs` | `BACKEND_INTERNAL_URL`, default `http://localhost:3000` |
| Production (nginx) | `nginx.conf.template` | `BACKEND_INTERNAL_URL` at container start; `PORT` too |

`ngsw-config.json` excludes `/api/**` from SPA navigation handling and does not cache API responses.

## Install MiPlante

This scope is **installation only**, not an offline product. Existing static-asset caching stays in
place, but sign-in, sales, financial data, payments and wallet consent require a connection. There
are no offline sales, transaction queues, background synchronization or push notifications.

- **Android Chrome / desktop Chrome or Edge:** visit sign-in or the merchant till and choose
  **Instalar MiPlante** when the browser makes installation available. The native dialog opens only
  after a click. Dismissing it does not trigger another prompt automatically.
- **iPhone / iPad:** open the site in Safari. Choose **Instalar MiPlante** to expand the instructions,
  then use **Compartir → Añadir a pantalla de inicio** in Safari.
- **Unsupported browsers:** keep using the web app; no non-functional native-install button appears.
- The install action is hidden when the app is running standalone or reports installation complete.
  Browsers do not consistently expose whether it was installed in a different browser or session.

The manifest uses the stable identity `/`, scope `/` and launch URL `/login`. A valid session is
resolved by the existing sign-in flow and redirects to the merchant till or onboarding. Keeping the
identity at `/` avoids changing the app's previous implicit identity when changing its launch URL.
Existing branded icons are declared as `any`, not `maskable`: the logo does not fit completely inside
the maskable safe circle, so browsers should apply their own padding rather than crop it.

### Production validation

Installation requires **HTTPS** (or `localhost` for local checks), not plain HTTP on a phone's LAN IP.
The Angular worker is disabled in development mode. `npm start` / the Docker `dev` target are not
production-PWA checks: use the final nginx image, or serve `dist/frontend/browser` with an SPA fallback.

```bash
npm test -- --watch=false
npm run build
```

Before release, check the following on the production build:

- [ ] DevTools Application shows a valid manifest with 192/512 icons, `/login` as start URL and no
      installability errors. The icons and `apple-touch-icon.png` return images, not SPA HTML.
- [ ] `/manifest.webmanifest` returns `application/manifest+json` and `Cache-Control: no-cache`.
      `/ngsw-worker.js` and `/ngsw.json` return the worker/JSON with revalidation headers, not SPA HTML.
- [ ] Once the worker is active, direct loads of `/login` and `/merchant?id=<your-merchant-id>` work;
      `/api/**` is still handled by the backend, never by the navigation fallback.
- [ ] On Android Chrome and desktop Chrome/Edge, accept installation and launch from the new icon.
      It opens standalone at sign-in, or reaches the correct till with a valid session.
- [ ] Dismiss installation: the current page remains usable, with no automatic second dialog.
- [ ] On a real iPhone/iPad, add from Safari, check the home-screen icon, launch and sign in.
- [ ] In the installed app, create a test-network sale, authorize through the wallet and return to
      MiPlante. Verify the same sale reaches its expected state without duplication. Depending on the
      OS/browser, the wallet callback may open a browser tab rather than the installed app.
- [ ] Sign out and reopen: the app requires sign-in again. Check narrow mobile layouts and keyboard
      access to the install button and the expandable iOS instructions.

Unit tests exercise prompt capture, single-use events, cancellation, failures, standalone detection,
iOS guidance and header opt-in. Native OS installation and wallet redirects still need device QA;
jsdom cannot validate those behaviors.

## Structure

- `src/app/core`: motion, money formatting, API access, updates and install-event handling.
- `src/app/shared/brand`: logo (vector paths taken from the brand PDF) and doodles.
- `src/app/shared/ui`: reusable UI, including the opt-in install action.
- `src/app/features/<feature>`: one folder per feature, holding its own domain logic and UI.
- `src/styles.scss`: design tokens (`--monte`, `--lima`, `--papel`…), type, `.button` and
  `.button-ghost`.
