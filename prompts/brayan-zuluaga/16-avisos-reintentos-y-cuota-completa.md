# Prompt 16 — Avisos, pagos fallidos sin reintento automático y cuota completa en la fecha

**Fecha:** 17 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

Un pago a un acreedor que fallaba se reintentaba cada minuto. Pero un fallo puede ser un timeout en el que el dinero sí salió, y reintentar podía pagar dos veces. Además, en un mes flojo el acreedor recibía menos que la cuota acordada, y el tendero no tenía dónde enterarse de lo que pasaba con sus pagos.

## Prompt de ingeniería (versión refinada)

> 1. Si un pago falla, no lo reintentes automáticamente: registra el fallo, notifica al tendero y deja que lo revise y decida.
> 2. Crea un panel de notificaciones con recordatorios antes de cada pago (por ejemplo: "Mañana viene el proveedor: ya tienes $ 45.000 guardados"), pagos enviados y pagos por revisar.
> 3. Si lo apartado no alcanza para la cuota en la fecha de pago, completa la diferencia con las ganancias.
> 4. Entrega pruebas, documentación y commits atómicos.

## Decisiones tomadas con el usuario

- En la fecha de pago se envía la cuota completa: lo apartado y, si falta, de las ganancias. Nunca más que la cuota, lo que se debe o el límite mensual.
- Un pago fallido ofrece "Reintentar el pago" o "Ya llegó, marcar como pagado".

## Resultado

- **Backend:**
  - El pago de fecha registra `topUp`, la parte que salió de las ganancias, y cuenta para la cuota del mes.
  - Un pago fallido cuenta como el del mes y nunca se reintenta solo; uno sin confirmar se vuelve fallido a los 10 minutos.
  - Nuevas rutas `retry` y `mark-paid`.
  - Avisos calculados en el dashboard: pagos fallidos, próximos pagos con lo apartado y lo que saldrá de las ganancias, pagos enviados y autorización pendiente.
  - ADR 0015, y 161 pruebas en verde contra PostgreSQL.
- **Web:**
  - Campana con contador y pestaña Avisos; los pagos fallidos van primero y "marcar como pagado" pide confirmar en la misma tarjeta.
  - Aviso en Inicio, y el historial muestra la parte que salió de las ganancias.
  - Verificado con jsdom.
