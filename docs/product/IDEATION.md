# Ideation and decision

How we chose what to build during the Open Payments Hackathon (Ruta N, Medellín, October 16–17, 2026).

## Constraints

- **Mandatory:** a working Open Payments flow, shown end to end in the demo: payment request →
  authorization (user consent) → execution → successful completion.
- **Judging criteria:** problem definition, use of Open Payments, user experience, technical quality,
  presentation, innovation, inclusion and impact.
- **Prizes:** Financial Inclusion (Puntored), Innovation (FIND, EAFIT), Impact (Ruta N) and a
  community vote (This Week in Fintech). A team can win only one.
- **Time:** from Friday 10:30 to the code freeze on Saturday 11:00.

## What has won before

From the published winners of previous Interledger hackathons
([Mexico City 2025](https://interledger.org/news/building-real-solutions-interledger-hackathon-winners-2025),
Cape Town 2024–2026, HackOMania 2025–2026):

- A **specific community**, not "users": funeral-cover families, spaza shops, disaster victims.
- **Channels people already have**: WhatsApp, QR without a card terminal, USSD, voice.
- **Open Payments primitives used deliberately**: grants with limits, recurring grants, split
  payments, conditional payouts. Judges have praised "the granularity GNAP enables".
- **Pooled or conditional money** (community funds, micro-insurance, goal-based payouts).
- **A live payment on stage**, and a product story rather than a protocol demo.

## Candidates

Seven ideas from the team board, scored 1–5 against the criteria (higher is better; _demo risk_ is
scored so that 5 means lowest risk).

| Idea                                                                           | Problem | Open Payments depth | Inclusion | Innovation | Impact | Demo risk | Total  |
| ------------------------------------------------------------------------------ | ------- | ------------------- | --------- | ---------- | ------ | --------- | ------ |
| **MiPlante**: every sale splits itself into profit, debt repayment and savings | 5       | 5                   | 5         | 5          | 5      | 3         | **28** |
| Digital _fiado_: the shop collects store credit on payday, within a cap        | 4       | 4                   | 5         | 3          | 4      | 5         | 25     |
| Self-splitting income for social security and taxes                            | 4       | 4                   | 4         | 3          | 4      | 4         | 23     |
| Collective purchase / _natillera_ with conditional release                     | 4       | 4                   | 4         | 3          | 4      | 2         | 21     |
| Subscriptions for micro-businesses                                             | 3       | 4                   | 3         | 2          | 3      | 5         | 20     |
| Verifiable income passport                                                     | 4       | 2                   | 4         | 3          | 4      | 3         | 20     |
| Transparent cross-border invoicing for freelancers                             | 3       | 4                   | 2         | 2          | 3      | 4         | 18     |

## Decision

**We build MiPlante.**

- It attacks a problem everyone in Medellín recognizes (_gota a gota_), with a one-line promise:
  _if there are no sales today, nothing is collected today_.
- It needs the Open Payments features that set the protocol apart: a grant the merchant approves
  once with a daily cap, automatic outgoing payments, and splits across wallets of different
  providers.
- Revenue-based repayment through grants has not appeared among previous Interledger winners; the
  closest one, VibePayments (Mexico City 2025), split payroll payments.
- It speaks to every judge: inclusion (shopkeepers are Puntored's network), innovation (programmable,
  interoperable revenue-based financing), impact (an alternative to illegal lending) and trust (the
  merchant can never be charged more than the cap they approved).

Two other ideas fold into it instead of competing with it:

- **Self-splitting income** is the same mechanism: a social-security or tax reserve is just another
  rule.
- **Income passport** comes for free from the sales history, and becomes a roadmap item.

**Plan B:** digital _fiado_, which runs on the same recurring-grant flow with no new logic.

## Scope discipline

The hackathon guide warns that a simple idea that works beats a big one that tries to do too much.
The demo therefore shows exactly one sale: a customer pays 10,000 COP by QR, and the sale splits
itself in real time into 8,000 for the merchant, 1,500 for a microcredit and 500 for an emergency
fund.
