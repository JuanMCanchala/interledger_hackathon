# 18. A phone at the counter shows each new sale

- **Status:** Accepted
- **Date:** 2026-10-17
- **Builds on:** ADR 0012 (each sale is a payment request), ADR 0017 (GlorIA)

## Context

Many shopkeepers keep the till on one device and show the QR to the customer on another, usually
an old phone on the counter. Until now that phone opened one sale (`/cobro?sale=…`), so every sale
meant scanning a new link from the till. With GlorIA preparing sales by voice, that step defeats
the point: the shopkeeper says "sí" and still has to pick up the phone.

## Decision

- **A shop can link a counter display.** In the till (Vender, or Ajustes) the shopkeeper links it;
  the shop gets a random key and the till shows the link `/cobro?pantalla=<key>` as a QR. The phone
  scans it once.
- **The phone always shows the newest sale.** It polls `GET /api/displays/:key`, which needs no
  session and answers with the shop's name and its newest sale (from the last 30 minutes) while it
  waits for the customer, or for a minute after it is paid; otherwise nothing, and the phone waits.
  A sale made by the shopkeeper or confirmed through GlorIA reaches it within two seconds. Reading
  it moves the sale forward, as `/cobro` does.
- **The key only shows what a customer would see**: the same public view of a sale as `/cobro`,
  without where its shares go. It is stored as is, so the till can show the link again whenever a
  phone needs it. Linking again makes a new key and unlinks the phones that had the old one.
- **The display stays awake** with the Screen Wake Lock API where the browser supports it, chimes
  when a payment lands, and has no way back into the till.
- **One sale at a time.** Making a sale closes the shop's older sales that nobody started paying:
  their payment requests are completed at the wallet, so their QR takes no more money, and they
  read `cancelled` ("Reemplazado"). The payment record of a closed request is marked failed, never
  completed, so it can never read as paid. A sale the customer is authorizing or paying, or that
  received part of its money, is left as it is. This runs in the background, after the new QR.

## Consequences

- One scan sets up the counter for the day; "Gloria, cobra veinte mil" puts the QR in front of the
  customer with no hands, and the list of sales never piles up QR codes waiting for nobody.
- Anyone with the link sees the shop's sale in progress (amount and note), as with a sale's own
  link. Changing the link is the remedy if a phone is lost.
- The display polls even when idle; at one request every 2.5 seconds per phone that is negligible
  for a shop, and the poll pauses while the tab is hidden.
