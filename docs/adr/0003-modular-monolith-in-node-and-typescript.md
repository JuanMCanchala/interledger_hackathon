# 3. Modular monolith in Node.js and TypeScript

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

We need a backend that signs Open Payments requests, keeps grant tokens server-side, applies money
rules and serves a web client, built in one day by a small team and run on a laptop for the demo.

The JavaScript SDK is the most mature Open Payments SDK and the one the official examples use. PHP
and Rust SDKs exist, but have fewer examples.

## Decision

- **One deployable service** (a modular monolith), with modules that depend inwards:
  - `shared/`: money and error primitives.
  - `domain/`: pure business rules, such as the allocation engine.
  - `merchants/`: application services for onboarding, sales and settlement.
  - `openPayments/`: the adapter around the SDK.
  - `storage/`: persistence.
  - `http/`: the Express API.
- **Node.js (22+) and TypeScript in strict mode**, run with `tsx`, so there is no build step.
- **Express 5** for HTTP, because it is familiar to everyone and handles async errors natively.
- **zod** to validate every input at the edge: environment variables and request bodies.
- **Vitest** for tests. The Open Payments adapter sits behind an interface (`PaymentOperations`), so
  the business flows are tested against an in-memory fake without network calls.

## Consequences

- One process to run and one URL to demo; no network hops between our own components.
- The domain can be tested without network or framework code, and the adapter can be swapped, for
  example for another SDK or a mock wallet.
- Module boundaries are enforced by convention and review, not by tooling. That is acceptable at this
  size.
- Scaling to several instances would first require moving persistence out of the process (see
  [ADR 0007](0007-json-file-persistence-for-the-hackathon.md)).
