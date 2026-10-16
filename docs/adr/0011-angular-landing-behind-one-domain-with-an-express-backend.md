# 11. Angular landing behind one domain, with an Express backend

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

[ADR 0009](0009-adopt-nextjs-nestjs-prisma-and-postgresql-stack.md) planned a Next.js frontend and a
NestJS backend. What shipped is different:

- The team designed the landing and the brand's design system as an **Angular PWA with GSAP**: a
  loader, smooth scroll, the notebook story, the features bento and an interactive till.
- The backend stayed on **Express** with zod (ADR 0003). Prisma and PostgreSQL were adopted as planned
  (ADR 0010).
- The merchant and customer pages (onboarding, the till and dashboard, the QR checkout, the sandbox)
  are plain HTML served by the backend.

Two constraints decide how the pieces meet:

1. **The wallets' consent callbacks must reach the backend** at the URL MiPlante gave them
   (`PUBLIC_BASE_URL`). That URL is also where the browser lands after consent, and the QR codes
   point to the same domain.
2. **The Next.js frontend was also a proxy** that put `/api/*` and the pages under the public domain.

## Decision

- **The frontend is the Angular app** in `frontend/`, replacing the Next.js scaffold.
- **One public domain, proxied to the backend.** The frontend container proxies `/api/*`, `/js/*` and
  the till, onboarding, checkout and sandbox pages to the backend:
  - in production with **nginx**, from `nginx.conf.template`, reading `BACKEND_INTERNAL_URL` and
    `PORT` when the container starts;
  - in development with **`ng serve`** and `proxy.conf.mjs`.
- **The PWA's service worker never answers the backend's navigations.** `ngsw-config.json` excludes
  `/api/**`, `/js/**` and any path with an extension from the landing's navigation fallback. Without
  that, a phone that once opened the landing would get the landing back instead of the consent
  callback.
- **The landing links to the real app:** "Registrar mi negocio" (`/onboard.html`), "Abrir mi caja"
  (`/merchant.html`) and the sandbox.

## Consequences

- People, QR codes and wallets only ever see the frontend URL, in development, on Railway and in any
  other host.
- The backend URL is runtime configuration: changing it restarts nginx, without rebuilding the image.
- The proxied paths are listed twice, in `proxy.conf.mjs` and in `nginx.conf.template`. A new backend
  page must be added to both.
- The merchant screens keep their own styles for now. Moving them into Angular with the same design
  system is the next step, and would let the proxy shrink to `/api/*`.
