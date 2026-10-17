# Prompt 07 — Cobro por QR con Open Payments y detección automática del pago

**Fecha:** 16 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

En el checkout, el cliente tenía que escribir su billetera, y su teléfono debía alcanzar el servidor del comercio. El objetivo es que el QR abra directamente la billetera del cliente, con su sesión iniciada, y que MiPlante identifique el pago solo.

## Prompt de ingeniería (versión refinada)

> 1. Investiga qué permite la red de prueba de Interledger. Distingue las páginas de pago que sí ven la sesión del usuario de las que no. Valida cada hipótesis contra la red real y no solo contra mocks.
> 2. Haz que el QR de la venta abra la pantalla de envío del test wallet con la tienda como destino (`/send?merchantWA=…&merchantDescription=…`). Así el cliente con sesión solo elige su billetera.
> 3. Pide, en el mismo consentimiento del tope diario, permiso para leer los pagos que llegan a la billetera de la tienda (`incoming-payment` con `list-all` y `read-all`).
> 4. Empareja cada pago con la venta abierta más reciente creada antes de él cuyo monto coincida, con un margen del 2 % para otras monedas. Usa un reclamo atómico con un índice único, para que un pago nunca cubra dos ventas, ni siquiera con polls simultáneos.
> 5. Mantén el checkout de MiPlante como alternativa. Permite renovar desde la caja los consentimientos anteriores a esta función.

## Resultado

- **Descartado tras probarlo contra la red real:** poner en el QR la URL de una incoming payment. Esas URLs devuelven JSON y la página `pay.interledger-test.dev` responde 500 con ellas. Se revirtió.
- **Adoptado:** la pantalla de envío del test wallet, que lleva a un cliente sin sesión al login y lo devuelve a la pantalla. El emparejamiento por monto está probado en memoria y contra PostgreSQL. La prueba de punta a punta del equipo fue exitosa.
