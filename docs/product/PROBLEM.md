# Problem statement

## Who has the problem

Colombian micro-merchants who live day to day: neighborhood shopkeepers (_tenderos_), barbers,
street vendors and other self-employed workers. They sell many small amounts every day, keep all the
money in a single pocket, and have obligations that do not care how the day went.

## The cash-flow trap

1. **Income is daily and volatile.** A good Saturday and a rainy Tuesday can differ several times
   over, and everything lands in the same pocket, mixed with household spending.
2. **Obligations are fixed.** Supplier invoices and loan installments arrive on fixed dates for fixed
   amounts, whether or not there were sales.
3. **A bad day breaks the chain.** When the supplier arrives after a slow week, the merchant has
   nothing set aside. Formal credit asks for payslips and history the merchant does not have.
4. **The fallback is predatory.** The informal _gota a gota_ lender is fast and asks no questions,
   but charges interest far above the legal maximum and collects aggressively.

The result is a merchant who works every day and still ends up with less capital and more debt.

## Context

### The people

| Fact                         | Figure                                                                          | Source                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Micro-businesses in Colombia | 5,297,252 in 2024; 90.5% are own-account workers                                | [DANE, EMICRON 2024](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-2024.pdf)                      |
| People working in them       | 6,879,489 in 2024                                                               | [DANE, EMICRON 2024](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-2024.pdf)                      |
| Self-employed workers        | 10.1 million, 41.3% of everyone employed (June 2026)                            | [DANE, GEIH June 2026](https://www.dane.gov.co/files/operaciones/GEIH/bol-GEIH-jun2026.pdf)                        |
| Medellín's weight            | 17.5% of the micro-businesses in the 24 main cities (≈426,000, our calculation) | [DANE, EMICRON 24 cities 2025](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-24Ciudades-2025.pdf) |

### The credit gap

| Fact                                            | Figure                                                                                                              | Source                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Few micro-businesses ask for credit             | 14.2% asked for any credit in 2025                                                                                  | [DANE, EMICRON 24 cities 2025](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-24Ciudades-2025.pdf)                                                             |
| Those who ask often end up with _gota a gota_   | 35.6% of them went to _gota a gota_ lenders, against 41.6% to regulated institutions                                | [DANE, EMICRON 24 cities 2025](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-24Ciudades-2025.pdf)                                                             |
| Fear of debt keeps them away from formal credit | 42.5% of those who did not ask cite fear of debt (2024)                                                             | [DANE, EMICRON 2024 results](https://www.dane.gov.co/files/operaciones/EMICRON/pres-EMICRON-2024.pdf)                                                                         |
| _Gota a gota_ is extremely expensive            | Up to 20% a month according to the Attorney General's Office, which is over 790% effective a year (our calculation) | [Forbes Colombia](https://forbes.co/editors-picks/el-drama-del-gota-a-gota-un-arma-de-doble-filo)                                                                             |
| The legal maximum is far lower                  | Usury cap for urban _crédito popular productivo_: 87.62% effective a year (October 2026)                            | [Superfinanciera](https://www.superfinanciera.gov.co/publicaciones/10116267/superfinanciera-certifica-el-interes-bancario-corriente/)                                         |
| Medellín already lends against _gota a gota_    | Banco Distrital _nanocréditos_ at 0.91% a month: 14,902 loans to 5,844 people by July 2026, repaid in fixed terms   | [Alcaldía de Medellín](https://www.medellin.gov.co/es/sala-de-prensa/noticias/con-casi-15-000-desembolsos-el-banco-distrital-de-medellin-consolida-su-linea-de-nanocreditos/) |

### The payment rails

| Fact                                                | Figure                                                                                                                                          | Source                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Micro-businesses still run on cash                  | 95.6% accept cash and 71.8% accept transfers (24 cities, 2025)                                                                                  | [DANE, EMICRON 24 cities 2025](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-24Ciudades-2025.pdf)                                                                                                                                                                                   |
| Cash is still the main way people pay               | 66% of payments in 2026, down from 79% in 2023                                                                                                  | [ENTER.CO](https://www.enter.co/?p=587712)                                                                                                                                                                                                                                                          |
| Digital money rarely leaves its own institution     | 95% of digital transfers stay within the same bank                                                                                              | [ENTER.CO](https://www.enter.co/?p=587712)                                                                                                                                                                                                                                                          |
| Instant payments already exist                      | Bre-B: 116 million keys and 36 million clients in its first year; rules for business collections and payouts opened for comment in October 2026 | [El País](https://www.elpais.com.co/economia/en-su-primer-ano-bre-b-mueve-262-billones-y-alcanza-116-millones-de-llaves-en-colombia-0604.html), [Forbes Colombia](https://forbes.co/2026/10/06/economia-y-finanzas/bre-b-gana-terreno-frente-al-efectivo-y-prepara-su-salto-a-pagos-empresariales/) |
| Open finance is becoming mandatory                  | Decree 0368 of April 2026 makes open finance mandatory for supervised entities                                                                  | [Portafolio](https://www.portafolio.co/economia/finanzas/finanzas-abiertas-obligatorias-impulsaran-el-desarrollo-del-sistema-y-la-inclusion-financiera-en-el-pais-491720)                                                                                                                           |
| Trust, not access, is the open question in Medellín | The Interledger Foundation and the University of Oxford are studying how trust drives adoption of digital finance in the city                   | [FF News](https://ffnews.com/news/interledger-foundation-and-university-of-oxford-launch-financial-inclusion-research-in-colombia)                                                                                                                                                                  |

## Why current options fall short

- **Fixed-installment microcredit**, even at fair rates like Medellín's _nanocréditos_, charges the
  same amount on a day with no sales as on a good day.
- **Instant payments (Bre-B)** move money fast, but every transfer is still manual: nothing pays the
  supplier or the lender in proportion to what was actually sold.
- **Revenue-based repayment already works, but only inside closed ecosystems.** Mercado Pago
  ([retains a share of each sale](https://www.mercadopago.com.mx/blog/credito-basado-en-ventas-mercado-pago)),
  Square ([a fixed percentage of daily card sales](https://squareup.com/help/us/en/article/6453)),
  Stripe Capital ([a percentage of Stripe sales](https://docs.stripe.com/capital)) and Shopify Capital
  ([only on days you make sales](https://www.shopify.com/capital)) all collect from sales processed
  on their own platform. A neighborhood shop paid from many different wallets is left out.

## The opportunity

Open Payments lets a merchant authorize, once, a **capped, revocable, interval-limited debit** from
their own wallet, whatever provider holds it. That makes it possible to repay in proportion to real
sales, across wallets: _if there are no sales today, nothing is collected today_, and never more than
the daily cap the merchant approved.

## What success looks like

- The merchant repays suppliers and microcredit without ever being charged on a day without sales.
- An emergency fund grows automatically, so a bad week does not push the merchant to _gota a gota_.
- Every sale leaves a verifiable income record the merchant can show to get formal credit.
