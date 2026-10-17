# 17. GlorIA, an assistant that reads and prepares but never moves money

- **Status:** Accepted
- **Date:** 2026-10-17
- **Builds on:** ADR 0013 (quotas and accounts), ADR 0015 (due day and failed payouts), ADR 0016 (emergency fund)

## Context

The till already holds what a shopkeeper needs to know: what came in this month, the real profit,
what is reserved for each supplier and when it is paid, what failed. Finding it means knowing the
tabs, and many shopkeepers would rather ask: "¿cuánto le tengo a mi proveedor?". Many also sell with
their hands busy, so typing an amount is slower than saying it, and they look away from the screen
while the customer pays.

A language model can answer those questions in plain Spanish. It also brings risks that matter in a
payments app: it can invent figures, it can be talked into acting, and what it receives leaves the
shop's infrastructure.

## Decision

- **GlorIA is a chat in the till, on DeepSeek V4.1 Flash** (`deepseek-flash`) through its
  OpenAI-compatible API with tool calling. It is optional: without `DEEPSEEK_API_KEY` the route
  answers `503` and the till works the same.
- **Reasoning is off** (`thinking: disabled`). The questions are short lookups over the shop's own
  figures, and answers come back in 1 to 4 seconds instead of several more.
- **She only reads, through tools over the dashboard** (summary, obligations, savings, notices,
  recent sales, monthly cap). The figures reach her already formatted in pesos, so she repeats them
  rather than computing them, and the prompt forbids inventing any.
- **She never moves money.** Her only actions are drafts the shopkeeper confirms with a tap: a sale
  filled into Vender (between $100 and $100.000.000, only with an active consent), or a section to
  open. Charging, paying, retrying a payout and using the emergency fund stay buttons in the till.
- **Data minimization.** Wallet addresses, tokens and ids are never sent to the model, only labels,
  amounts and dates. The conversation is not stored on the server; the browser keeps it for the
  visit (`sessionStorage`).
- **Limits.** Owner of the shop only, 20 questions per minute per shop, the last 12 turns, at most
  4 tool rounds per answer. A model failure gives a kind message and a server log, never a stack.
- **Voice runs on the device.** Dictation and spoken replies use the browser's Web Speech API in
  es-CO; the payment chime is WebAudio. The model only ever receives text. The till also says each
  payment out loud ("¡Pago recibido! Veinte mil pesos") and the payouts that are sent or fail, which
  the shopkeeper can turn off in Ajustes. The amount in Vender can be dictated ("veinte mil de
  arroz"), parsed locally.

## Consequences

- A shopkeeper can ask instead of browsing, and sell by voice, without new risk to the money: the
  worst a bad answer can do is prepare a draft the shopkeeper does not confirm.
- DeepSeek processes the questions and the shop's summarized figures outside Colombia. Under Ley
  1581 de 2012 a production launch needs the shopkeeper's informed consent for that transfer, or a
  provider with a data-processing agreement in an adequate country; the model sits behind the
  `ChatModel` port, so changing provider touches one file.
- Browser support varies: dictation needs Chrome, Edge or Safari, and speech needs a Spanish voice
  installed. Where they are missing the buttons do not show and the chat still works by text.
- Each question costs model tokens; the rate limit and the short history bound it.
