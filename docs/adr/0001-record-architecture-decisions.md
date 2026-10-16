# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Three people are building MiPlante in about 24 hours, and the mentors who review the code on Saturday
were not in the room when we made the decisions. The hackathon also asks us to explain what we built
and why. Decisions that live only in chat messages get lost or re-argued.

## Decision

We keep architecture decision records in `docs/adr/`, one Markdown file per decision, numbered in the
order they were made, using the Context / Decision / Consequences format.

## Consequences

- Reviewers can follow the reasoning behind the code in a few minutes.
- Writing an ADR takes a few minutes per decision; we only write them for decisions that are costly
  to reverse or that a reviewer would question.
- Accepted ADRs are not edited. If a decision changes, a new ADR supersedes the old one.
