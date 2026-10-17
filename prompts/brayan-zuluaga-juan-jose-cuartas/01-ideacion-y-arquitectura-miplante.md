# Registro de Prompts: Ideación, Investigación de Inclusión Financiera y Diseño de MiPlante

**Fecha:** 16 de octubre de 2026  
**Fase:** Ideación, Investigación de Contexto Colombiano, Canvas de Ideación y Arquitectura de Wallets  
**Herramienta:** Google Antigravity (Gemini)

---

## Prompt 1 — Lluvia de ideas inicial y análisis de ganadores previos de Interledger
> **Prompt enviado:**
> "Estamos participando en la Hackathon de Interledger Open Payments en Medellín, Colombia. Necesitamos estructurar una lluvia de ideas enfocada en los pilares de Innovación e Inclusión Financiera. Analiza los proyectos ganadores de ediciones anteriores de Interledger (Ciudad de México y Sudáfrica) y cruza sus patrones de éxito con las problemáticas reales del ecosistema financiero y la economía popular en Colombia para proponer soluciones disruptivas que aprovechen al máximo las capacidades del protocolo Open Payments."

**Resultado y decisiones del equipo:**
- Se analizaron los ganadores globales previos (*SafePool*, *VibePayments*, *Paguito*, *Bokamoso*, *Common Cents*, *Fireline*).
- Se identificó que los proyectos ganadores destacan por combinar **automatización programable mediante Grants** (en lugar de pagos únicos manuales) con un problema social tangible y una demostración visual en tiempo real.

---

## Prompt 2 — Investigación de fuentes oficiales y cifras de inclusión financiera en Colombia (2025–2026)
> **Prompt enviado:**
> "Recopila fuentes oficiales actualizadas (2025–2026) con sus respectivos enlaces y cifras verificables sobre la situación de los trabajadores independientes, micronegocios, informalidad laboral, acceso a crédito formal vs. crédito informal ('gota a gota') y adopción de pagos digitales en Colombia (DANE, Banca de las Oportunidades, Superintendencia Financiera y Banco de la República), con el fin de sustentar el problema y el impacto de nuestra propuesta."

**Resultado y decisiones del equipo:**
- Se documentaron cifras clave de la **GEIH y EMICRON del DANE (2025–2026)** (~44% de ocupados independientes, +4,6 millones de micronegocios, >90% de cuenta propia, 55% de informalidad).
- Se integraron los hallazgos del **15° Reporte de Inclusión Financiera (2026)** de Banca de las Oportunidades sobre la brecha entre tenencia de cuentas (96,3%) y acceso a crédito formal (~52%), explicando por qué los micronegocios caen en el "gota a gota" debido a la rigidez de las cuotas bancarias fijas y la mezcla del flujo de caja diario.

---

## Prompt 3 — Diseño de "MiPlante" y puente entre el efectivo físico y Open Payments
> **Prompt enviado:**
> "Siguiendo la recomendación del jurado ('pensar muy grande y ejecutar en pequeño'), necesitamos resolver una barrera estructural de los micronegocios en Colombia: más del 65% de sus transacciones diarias siguen ocurriendo en efectivo físico. ¿Cómo diseñamos la arquitectura de 'MiPlante' para que un tendero o trabajador independiente pueda dividir automáticamente sus ingresos hacia proveedores, pago de microcréditos ('anti-gota') y ahorro de emergencia utilizando Open Payments, incluso cuando gran parte de sus ventas o el cambio ('vuelto') involucran efectivo o billeteras tradicionales?"

**Resultado y decisiones del equipo:**
- Se diseñó el modelo de **Repago Elástico y Split Automático basado en Grants** de Open Payments, sumado al mecanismo de **"Vuelto Digital / Cajero Humano"** y **Liquidación en Espejo**:
  1. Cuando entra un pago digital o multidivisa (`Incoming Payment`), el `Grant` del tendero ejecuta `Quotes` y `Outgoing Payments` fraccionados hacia el Proveedor, el Fondo Anti-Gota y el Ahorro de Emergencia.
  2. Cuando el pago ocurre en efectivo físico, el tendero conserva el billete como liquidez en mano y puede entregar el cambio como **"vuelto digital"** vía Open Payments al cliente, mientras su `Grant` pre-autorizado liquida automáticamente el porcentaje correspondiente al proveedor y al ahorro desde su saldo digital.

---

## Prompt 4 — Estructuración del Canvas de Ideación y simulación de roles con Test Wallets
> **Prompt enviado:**
> "Estandariza la propuesta definitiva de 'MiPlante' siguiendo exactamente la estructura de los 5 bloques del Canvas de Ideación oficial de la Hackathon (Problema, Impacto, Solución, Flujo del Dinero e Innovación), especificando las piezas de Open Payments y los patrones de pago utilizados. Adicionalmente, define la topología de billeteras de prueba (Wallet Addresses y divisas) para un equipo de 5 integrantes de modo que podamos simular de extremo a extremo todos los actores del ecosistema."

**Resultado y decisiones del equipo:**
- Se consolidó el Canvas de Ideación oficial de **MiPlante**.
- Se definió una topología de **6 Wallet Addresses** distribuidas entre los 5 miembros del equipo:
  1. Tendero - Caja Principal (COP): `$ilp.interledger-test.dev/tienda-billeticos`
  2. Tendero - Bolsillo de Emergencia (COP): `$ilp.interledger-test.dev/ahorro-billeticos`
  3. Cliente Local / Efectivo (COP): `$ilp.interledger-test.dev/cliente-one`
  4. Cliente Extranjero Multidivisa (USD): `$ilp.interledger-test.dev/extranjero-billeticos`
  5. Proveedor de Mercancía (COP): `$ilp.interledger-test.dev/proveedor-billeticos`
  6. Fondo Microcrédito Anti-Gota (COP): `$ilp.interledger-test.dev/microcredito`

---

## Prompt 5 — Documentación técnica de las Wallets reales del equipo (sin modificar código de aplicación)
> **Prompt enviado:**
> "Sin iniciar aún el desarrollo de código, actualiza la documentación del proyecto (`docs/TEAM_WALLETS.md`, `docs/OPEN_PAYMENTS.md`, `docs/README.md`) y la plantilla de variables de entorno (`env.example`) utilizando las 6 Wallet Addresses reales creadas por nuestro equipo en el entorno de pruebas de Interledger (`$ilp.interledger-test.dev/tienda-billeticos`, `$ilp.interledger-test.dev/ahorro-billeticos`, `$ilp.interledger-test.dev/proveedor-billeticos`, `$ilp.interledger-test.dev/microcredito`, `$ilp.interledger-test.dev/cliente-one` en COP y `$ilp.interledger-test.dev/extranjero-billeticos` en USD)."

**Resultado y decisiones del equipo:**
- Se actualizaron [`docs/TEAM_WALLETS.md`](../docs/TEAM_WALLETS.md), [`docs/OPEN_PAYMENTS.md`](../docs/OPEN_PAYMENTS.md) y [`env.example`](../env.example) con los Payment Pointers oficiales del equipo manteniendo intacto el código de aplicación.

---

## Prompt 6 — Diagramas e imagen de arquitectura 100% en Docker especificados por el equipo (Frontend Next.js, Backend NestJS + Prisma ORM y DB PostgreSQL)
> **Prompt enviado:**
> "Aún no vamos a escribir código porque estamos cerrando el diseño arquitectónico. Nuestro equipo tomó la decisión de arquitectura de estructurar y contenerizar toda la plataforma en Docker Desktop (`docker-compose.yml`) dividida en tres contenedores definidos exactamente por nosotros:
> 1. **Contenedor 1 - Frontend:** Next.js (App Router, `:3001`) para las vistas del tendero (POS/Caja), onboarding, checkout QR del cliente y dashboard en vivo.
> 2. **Contenedor 2 - Backend:** NestJS (`:3000`) estructurado en módulos (`MerchantsModule`, `SalesModule`, `OpenPaymentsModule` integrando el SDK `@interledger/open-payments` y el motor de dominio en `BigInt`) junto con **Prisma ORM** (`PrismaService` con transacciones y bloqueos de fila para garantizar liquidación idempotente).
> 3. **Contenedor 3 - Base de Datos:** PostgreSQL 16 (`:5432`) con volumen persistente en Docker para almacenar comercios, reglas, ventas, liquidaciones, mandatos y pagos.
> 
> Siguiendo exactamente esta arquitectura e instrucciones definidas por el equipo, genera una imagen visual del diagrama de arquitectura (`docs/architecture-docker.svg`), actualiza los diagramas Mermaid en `README.md` y `docs/SYSTEM_DESIGN.md` (§3 y §4), y registra la decisión en `docs/adr/0009-adopt-nextjs-nestjs-prisma-and-postgresql-stack.md`."

**Resultado y decisiones del equipo:**
- El equipo definió al 100% la arquitectura de 3 contenedores en Docker (**1. Frontend `Next.js`**, **2. Backend `NestJS` + `Prisma ORM`**, **3. Base de Datos `PostgreSQL 16`**) y utilizó la IA únicamente para generar la imagen vectorial [`docs/architecture-docker.svg`](../docs/architecture-docker.svg), actualizar los diagramas Mermaid de [`README.md`](../README.md) y [`docs/SYSTEM_DESIGN.md`](../docs/SYSTEM_DESIGN.md), y documentar el ADR [`docs/adr/0009-adopt-nextjs-nestjs-prisma-and-postgresql-stack.md`](../docs/adr/0009-adopt-nextjs-nestjs-prisma-and-postgresql-stack.md).

---

## Nota de Trabajo Manual del Equipo — Inicialización de Servicios y Docker Compose
> **Ejecución manual por parte del equipo (Sin generación por IA):**
> El equipo creó e inicializó manualmente mediante comandos de terminal la infraestructura de contenedores en Docker Desktop (`docker-compose.yml`, `Dockerfile.backend`, `frontend/Dockerfile`), el esquema relacional en `prisma/schema.prisma` y la estructura base del servicio `frontend/` en Next.js, levantando los contenedores con `docker compose up -d`.
