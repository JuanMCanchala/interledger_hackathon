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
- **She knows the shop as it is right now.** Each question carries, after the fixed persona, the
  shop's state as JSON (summary, obligations, savings, notices, recent sales, monthly cap), the time
  in Bogotá and the section on screen, so most answers take one model call (about 1 to 2 seconds).
  The figures come already formatted in pesos, so she repeats them rather than computing them, and
  the prompt forbids inventing any. The same reads remain as tools. The persona goes first and never
  changes, so DeepSeek serves it from its context cache.
- **Strict tool calls.** Every tool is declared in DeepSeek's strict mode (beta endpoint): closed
  schemas, the amount an integer between $100 and $100.000.000, the section one of six. The model
  cannot call a tool with a malformed argument. The temperature is 0.2, for answers that stay with
  the facts.
- **Moving around the till does not depend on the model either.** "Llévame a inicio", "ve a
  avisos" or just "avisos" are read on the device; a reply that says it opened a section without
  asking the till to is caught too. After a charge or a move the chat steps aside and a short note
  by the launcher says what she did.
- **She charges at once, and never moves money.** Asked to charge ("cobra 50.000", "haz un cobro
  de $50,000"), she generates the sale's QR right away, in the till and on the counter display
  (ADR 0018), as if the shopkeeper had tapped "Generar QR". A clear request is read on the device,
  without the model, so a charge never depends on how the model reads it; the model's
  `preparar_cobro` covers the rest (between $100 and $100.000.000, only with an active consent). If
  the till cannot charge she says why. A QR only asks the customer to pay: paying a creditor,
  retrying a payout and using the emergency fund stay buttons in the till.
- **Cash too (ADR 0019).** "Vendí 15 mil en efectivo" records a cash sale and "consigné 50 mil" a
  deposit, read on the device first and through two strict tools otherwise; the state she gets
  includes what is still to deposit.
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

- **Hands-free, opt-in.** A switch (in the chat or in Ajustes) keeps the till listening for
  "Gloria": "Gloria, cobra veinte mil" is a request and "Gloria" alone wakes her (with a chime)
  for the next phrase. Everything else said in the shop is ignored. It uses the browser's continuous speech
  recognition, so while it is on the browser's speech service transcribes what the microphone hears;
  the till says so next to the switch and shows that it is listening. For production the wake word
  should be detected on the device (a small model such as Vosk or Porcupine in WebAssembly), sending
  audio only after "Gloria".
- **GlorIA speaks with a woman's voice** when the device has one (Salomé in Edge for es-CO, Helena,
  Sabina, Paulina, Google español…), and with a higher pitch when it has none.

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
