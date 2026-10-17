# Prompt 09 — Cada venta como solicitud de pago de Open Payments

**Fecha:** 17 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5), con subagentes de investigación en paralelo

## Contexto y objetivo

El cliente tenía que escribir el monto en la pantalla de envío de su billetera, y MiPlante emparejaba el pago por monto. Se buscaba la integración más alineada con las buenas prácticas de Open Payments, que además fuera la más clara de explicar al jurado.

## Prompt de ingeniería (versión refinada)

> 1. Determina si una página de terceros puede aprovechar la sesión del test wallet para conocer las billeteras del cliente. Revisa tres capas:
>    - el CORS y las cookies de la API del wallet, en el código fuente y con una prueba en vivo sin credenciales;
>    - si Open Payments o GNAP permiten elegir la billetera en la pantalla de consentimiento;
>    - si GNAP `subject` permite descubrir la billetera del usuario.
> 2. Contrasta el flujo actual con la guía oficial *Accept a one-time payment for an online purchase*.
> 3. Presenta las opciones con sus ventajas y desventajas para que el equipo decida.
> 4. Implementa la opción elegida en commits atómicos. Retira el emparejamiento por monto y su permiso `list-all`, documenta la decisión en un ADR y verifica contra la red real.

## Resultado

- **Investigación:**
  - La API del test wallet solo admite sus propios orígenes.
  - `identifier` es obligatorio para `outgoing-payment`, y el consentimiento solo permite aceptar o rechazar.
  - `subject` solo verifica una billetera que el cliente ya indicó.
  - En cambio, la pantalla `/send?merchantWA=` acepta la URL de una incoming payment: prellena el monto pendiente (editable), bloquea la descripción y el modo *receive*.
- **Opción elegida (A + B):**
  - Cada venta crea una incoming payment con `incomingAmount`.
  - El QR abre la billetera del cliente sobre esa incoming payment: el cliente solo confirma.
  - El checkout de MiPlante, con el flujo completo de la guía (quote, grant interactivo, outgoing payment), paga la misma incoming payment.
- **Verificado:** 103 pruebas, incluidas las de PostgreSQL. La creación del QR se probó contra la red de prueba. Decisión registrada en el ADR 0012.

## Ampliación — Pagos parciales

> La pantalla de envío del test wallet prellena el monto de la incoming payment, pero el cliente puede cambiarlo. Maneja un pago menor al de la venta: no repartas nada hasta que la incoming payment se complete; muestra en la caja cuánto llegó y cuánto falta, y deja el mismo QR para completar, ya que el wallet prellena lo pendiente. Si la solicitud vence incompleta, marca la venta como fallida e indica el monto recibido.

**Resultado:** la venta queda en `processing` con `pending` calculado, y se reparte solo cuando la incoming payment se completa. La caja muestra *"Llegaron $X de $Y. Faltan $Z"* y mantiene el QR. Dos pruebas nuevas: completar después de un pago parcial y vencimiento con un pago parcial (105 en total).
