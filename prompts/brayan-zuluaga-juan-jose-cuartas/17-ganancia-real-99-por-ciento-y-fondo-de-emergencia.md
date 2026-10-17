# Prompt 17 — Repartos hasta 99 %, ganancia real y fondo de emergencia como último recurso

**Fecha:** 17 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

Hubo tres problemas en el uso real:

- El tope de 50 % no permitía configurar una tienda real, donde la mayor parte de lo que entra va al proveedor.
- La "ganancia del mes" no descontaba lo que se sacó de las ganancias para completar cuotas.
- Faltaba un respaldo cuando ni las ganancias alcanzan para pagarle al proveedor.

## Prompt de ingeniería (versión refinada)

> 1. Investiga con fuentes qué parte de las ventas de una tienda de barrio va a proveedores, y elimina el tope de 50 %: los repartos pueden sumar hasta 99 % para que siempre quede ganancia.
> 2. Muestra en el panel la ganancia real del mes, descontando lo que salió de ganancias para completar cuotas, con su desglose y un gráfico diario.
> 3. Define el orden para completar una cuota: lo apartado, luego las ganancias y, como último recurso, el fondo de emergencia. Este último se usa solo si el tendero lo autoriza y lo elige, pasando primero el dinero a la tienda para pagarle completo al proveedor.
> 4. Entrega commits atómicos y sube a dev.

## Decisiones tomadas con el usuario

- Si falta para la cuota, se toma directamente de las ganancias.
- El fondo de emergencia es lo último que se toca, con su propia autorización.
- Siempre queda al menos 1 % de ganancia.
- "Dinero real" significa la ganancia real del mes, calculada a partir de los movimientos.

## Resultado

- **Investigación:** el margen bruto de una tienda de barrio ronda el 15–25 %, así que el 75–85 % va a mercancía. Los repartos ahora llegan hasta el 99 %.
- **Ganancia real:**
  - `realProfit` y su desglose (ahorro, pagado a acreedores, lo que salió de ganancias, apartado), además de la ganancia por día.
  - Se muestra en rojo si queda negativa.
- **Fondo de emergencia:**
  - Segundo permiso sobre la billetera de ahorro, que se autoriza en Ajustes.
  - En un pago fallido, "Usar mi fondo de emergencia" mueve el monto a la tienda y, cuando llega, reenvía el pago completo.
  - Nunca se usa solo. Queda registrado en el ADR 0016.
- **Verificación:** 168 pruebas en verde contra PostgreSQL. El segundo permiso y el 80 % al proveedor se verificaron contra la red real, y la prueba de humo pasa.
