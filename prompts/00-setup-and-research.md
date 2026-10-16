# Setup and research prompts

- Tool: Claude Code (Anthropic), model Claude Opus 5.5
- Date: 2026-10-16
- Exact text as typed, typos included. Slash commands that only configure the tool (`/rename`, `/model`) are omitted.

## Prompts we sent to Claude Code

### 1. Find the hackathon folder

```text
tenemos alguna carpeta de la hackthon de interledger cierto?
```

### 2. Create the repository

```text
crea el repo interledger_hackathon vacio por ahora
```

```text
en mi github personal
```

### 3. Research and ideas

```text
revisa ganadores de las anteriores hackathones de interledger revisa los tracks que hay para esta hackathon tambien mira ganadores de otras hacakthones similares y dame ideas para que hacer en la hackathon
```

### 4. Branches and README

```text
ve creando estas ramas en el repo prod, qa, dev y haz un readme vacio
```

### 5. AI disclosure files

```text
agrega el AI_USAGE.md y la carpeta /prompts a main
```

## Prompts Claude Code sent to its research sub-agents

For prompt 3, Claude Code wrote and sent these three prompts to sub-agents with web search.

### Sub-agent 1: past Interledger hackathon winners

```text
Research the WINNERS of previous Interledger Foundation / Open Payments hackathons. Time matters: the user is at a hackathon right now, so be efficient (aim for ~10 minutes of searching), prioritize breadth over perfection.

Events to look for (verify which actually exist): Interledger Summit hackathons (e.g. 2023, 2024 Cape Town, 2025), Open Payments hackathons in Latin America (Mexico, Peru, Colombia, Brazil — possibly run with Platzi or local partners), any "Open Payments Hackathon" editions in 2025–2026 (there is one at Ruta N Medellín on Oct 16–17 2026 — find whether earlier editions of this same series happened elsewhere, e.g. in other LatAm or African cities), Devpost hackathons sponsored by Interledger, Web Monetization hackathons, Grant for the Web / Interledger community hackathons, university hackathons with an Interledger track.

For each event: name, date, location, and the winning projects — project name, what it did in one or two lines, which prize/category it won, and HOW it used Open Payments / ILP (incoming/outgoing payments, quotes, interactive grants, recurring payments via grant intervals, split payments, Web Monetization / streaming payments, test wallet, Rafiki). Include links (interledger.org blog/news, Devpost, GitHub, LinkedIn posts by winners or organizers, YouTube). If organizers or judges said WHY a project won, capture that.

Use WebSearch (load it via ToolSearch "select:WebSearch,WebFetch" first) and WebFetch. Prefer primary sources. Do not invent projects: if you can't confirm something, say so.

Final report in English, under 1000 words: a list per event with winners, then 5–8 bullet "patterns in what wins at Interledger hackathons". Include URLs for everything.
```

### Sub-agent 2: this hackathon, sponsors and Open Payments technical state

```text
Research for a team competing RIGHT NOW in the "Open Payments Hackathon by Interledger" at Ruta N, Medellín, Colombia (Oct 16–17, 2026; code deadline Sat 11:00). Be efficient (aim for ~10 minutes), breadth first. Load web tools via ToolSearch "select:WebSearch,WebFetch" first.

What we already know from the official PDFs: no explicit tracks; all projects are judged for 4 prizes: "Premio Puntored a la Inclusión Financiera", "Premio FIND a la Innovación", "Premio Ruta N al Impacto", "Premio This Week in Fintech a la Comunidad" (audience vote). Criteria: problem definition, Open Payments use (working payment flow), UX, technical quality, presentation, innovation, inclusion, impact. Open Payments API integration is mandatory; demo must show payment request → authorization (consent) → execution → successful completion.

Find:
1. Any public page about this event (interledger.org events, Luma, Platzi, Ruta N, LinkedIn, X) with extra details: tracks/challenges/themes, prize amounts, judges, sponsors, workshops. Also whether the same "Open Payments Hackathon" series ran in other cities in 2025–2026 and with what themes.
2. Each sponsor: what is Puntored (Colombian payments/corresponsales/recargas company?), what is "FIND" (figure out exactly — maybe a fintech/innovation org or event in Colombia), Ruta N (Medellín innovation agency) and This Week in Fintech. What problems each cares about, so ideas can align with them.
3. Open Payments technical state as of 2026 for a 1.5-day build: Interledger Test Wallet (URL, currencies available, how to create wallet addresses and developer keys), SDKs (JS/TS @interledger/open-payments, PHP, Rust; latest versions), official example repos / starter kits (e.g. open-payments examples, "Open Payments Flow" guide, testnet repos, Boutique/demo apps), features: incoming payments, quotes, outgoing payments, interactive grants (redirect + finish/continue), non-interactive grants, recurring payments via grant `interval`/limits, fixed send vs fixed receive amounts, multi-currency on testnet, Web Monetization (link tag / extension), Rafiki. Known gotchas (key format, wallet address with $ prefix, grant continuation, interact.finish redirect, hash verification).
4. Anything Interledger has published about AI agents / agentic payments (e.g. an Open Payments MCP server, agent-initiated payments with spending limits via grants, comparisons with x402 / AP2).
5. Brief Colombian payments context 2026: Bre-B (Banco de la República instant payments) status, Nequi/Daviplata, remittance inflows to Colombia (size), informality, tiendas de barrio, corresponsales bancarios, gig workers, Venezuelan migrants.

Final report in English, under 1200 words, organized by the 5 sections above, with URLs. Do not invent facts; mark anything unconfirmed.
```

### Sub-agent 3: winners of similar fintech hackathons

```text
Research winning projects from payments / fintech / financial-inclusion hackathons that are similar to an Open Payments (Interledger) hackathon, focusing on 2023–2026. The user is competing in a hackathon right now, so be efficient (aim for ~10 minutes), breadth first. Load web tools via ToolSearch "select:WebSearch,WebFetch" first.

Sources to consider (verify; skip what you can't find): Stellar / Meridian / Stellar Community Fund hackathons, Mojaloop hackathons, Circle USDC hackathons, ETHGlobal events with payments prizes, Solana Pay hackathons, Stripe/Visa/Mastercard/PayPal developer hackathons, Pix / Drex hackathons in Brazil, Latin American fintech hackathons (Colombia — Bancolombia, Nequi, Colombia Fintech, Bre-B; Mexico — CoDi/SPEI; Platzi hackathons), financial inclusion hackathons (UNDP, Gates Foundation / Mojaloop, Mercy Corps, AfricArena), agentic payments hackathons (x402, Google AP2, Coinbase agent payments) in 2025–2026.

Deliver:
1. 15–25 concrete winning projects: name, event, one-line description, target user, which payment primitive was central (remittance, micropayments, streaming/pay-per-use, split payments, escrow, recurring/subscriptions, savings circles/ROSCA/"natillera"/"cadena", payroll for gig workers, offline/USSD/SMS, WhatsApp/voice interface, AI agent spending with limits, accessibility for elderly/visually impaired, merchant QR), and a URL.
2. A synthesis: 6–10 patterns in what wins (problem framing, demo style, scope, narrative with a real persona, live demo vs video, etc.) and common reasons strong projects lost.

Final report in English, under 1200 words, with URLs. Do not invent projects; mark anything unconfirmed.
```
