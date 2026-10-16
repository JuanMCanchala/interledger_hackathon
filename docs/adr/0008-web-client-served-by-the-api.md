# 8. Mobile-first web client served by the API

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

The demo needs four screens: merchant onboarding, the merchant's till and dashboard (with a QR for
each sale), the customer's checkout on a phone, and a developer sandbox for the raw Open Payments
flows. The customer opens the checkout by scanning a QR, so it must work on any phone without an app.
We have one day.

## Decision

- **Static, mobile-first pages** in `public/`, served by the same Express app. They use plain HTML,
  CSS and JavaScript, with no framework or build step. The only external library is a QR generator
  from a CDN, and the page falls back to a plain link if it fails to load.
- **The UI is in Spanish**, because that is what the merchants and customers speak; code and docs are
  in English for reviewers.
- **The HTTP API is the contract.** Pages only use the public JSON API, so a React, Next.js or
  WhatsApp client could replace them without backend changes. CORS can be enabled for a separate
  frontend through `FRONTEND_URL`.

## Consequences

- Same origin, so no CORS or deployment coordination for the demo, and a QR link works from any phone
  that can reach the server. A tunnel is needed when the phone is not on the same network.
- Plain JavaScript keeps the client small and readable, but without components or types; acceptable
  for four screens.
- Server data is always rendered with `textContent`, never with `innerHTML`, to avoid injecting
  merchant-provided text into the page.
