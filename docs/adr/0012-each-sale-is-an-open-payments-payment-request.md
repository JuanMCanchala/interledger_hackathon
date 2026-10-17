# 12. Each sale is an Open Payments payment request

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The customer used to pay through MiPlante's checkout. They typed their wallet address, MiPlante
quoted and requested an interactive grant on it, and the customer came back from the consent screen.
Their phone had to reach MiPlante, and they had to know their wallet address.

We checked three ways to skip typing it, against the specification, Rafiki, the Interledger test
wallet's source and the live test network:

- **Read the customer's wallets from their wallet session.** The test wallet's API only allows its
  own origins, so the browser blocks other sites.
- **Let the customer pick their wallet on the consent screen.** Open Payments requires the payer's
  wallet in `outgoing-payment` access, and the consent screen can only accept or reject.
- **Learn the wallet with GNAP `subject`.** It only verifies an address the client already sent.

What does exist: the test wallet's send screen (`/send?merchantWA=`) accepts an incoming payment
URL. It reads the amount and description from it, locks them, and preselects the signed-in user's
wallet.

## Decision

- **Each sale creates a payment request:** an incoming payment on the shop's wallet with
  `incomingAmount` equal to the sale. This is the incoming payment of the Open Payments one-time
  payment flow.
- **The QR opens the customer's wallet app on it.** The amount and the shop are fixed, and the
  customer only confirms. Without a wallet app configured, the QR is the incoming payment URL, which
  any Open Payments wallet can pay.
- **MiPlante's checkout stays.** It runs the one-time payment guide's full flow (quote, interactive
  outgoing-payment grant limited to the quote, outgoing payment), and it **pays the same incoming
  payment**.
- MiPlante polls the incoming payment until it completes, then splits the sale (ADR 0006). An unpaid
  request expires after an hour and fails the sale.

## Consequences

- **The amount comes from the protocol, not from the customer.** An incoming payment completes once,
  so a sale is paid once whichever way it is paid. No payment has to be matched to a sale by amount.
- **The customer's phone does not need to reach MiPlante** to pay by QR, and the customer never types
  a wallet address.
- **Two Open Payments flows meet at one resource.** The QR is the wallet-initiated push, and the
  checkout is the client-initiated, GNAP-consented pull. The shop's own consent (the daily cap) and
  the split charges are GNAP grants either way.
- **The QR depends on a wallet app that opens incoming payment URLs.** That holds for the Interledger
  test wallet's `/send`. Other wallets can pay the URL from their send screen.
