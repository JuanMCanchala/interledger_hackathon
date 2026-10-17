# Prompt 13 — Pago a proveedores y créditos en su fecha límite

**Fecha:** 17 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

Cada venta enviaba un pago pequeño a cada proveedor y crédito, lo que es desordenado para el acreedor. Se necesitaba juntar el monto y pagarlo completo en una fecha límite editable. También hacía falta poder mostrar esa fecha en la demo sin esperarla.

## Prompt de ingeniería (versión refinada)

> 1. En lugar de enviar la parte de cada obligación en cada venta, apártala en la billetera del tendero y envía un solo pago por todo lo apartado en su fecha límite de pago.
> 2. La fecha límite es un día del mes, editable por obligación. El ahorro sigue enviándose en cada venta.
> 3. Agrega un botón "Pagar ahora" por obligación y una opción, disponible también en producción, para simular que llegó la fecha de pago.
> 4. Mantén la cuota mensual y el límite mensual como topes. Actualiza pruebas, interfaz y documentación con commits atómicos.

## Decisiones tomadas con el usuario

- El pago se envía solo en la fecha límite, con todo lo apartado.
- Mientras tanto, el dinero se queda en la billetera del tendero; MiPlante lleva la cuenta.
- El ahorro no se acumula.
- La simulación de la fecha de pago está disponible siempre, no solo en un modo demo.

## Resultado

- **Backend:**
  - Las partes de las deudas quedan `reserved`; un programador paga cada deuda en su `dueDay` (1–28, por defecto 28) con un solo pago bajo el permiso mensual.
  - `POST /payouts` permite pagar ahora o simular la fecha.
  - La deuda baja cuando el pago llega, y si falla, el dinero sigue apartado.
  - Lo apartado ya cuenta contra el límite mensual y contra el saldo de la deuda.
  - ADR 0014, y 131 pruebas en verde contra PostgreSQL.
- **Web:**
  - Repartos muestra "Por enviar" y la fecha de pago de cada obligación, con su botón "Pagar ahora" y el historial de pagos.
  - Ajustes tiene "Simular que llegó la fecha de pago".
  - El registro por pasos y el editor piden el día de pago.
