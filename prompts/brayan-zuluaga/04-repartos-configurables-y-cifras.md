# Prompt 04 — Repartos configurables por la tienda y cifras verificadas del pitch

**Fecha:** 16 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

En la demo, el tendero llega ya registrado y debe poder ajustar sus repartos (proveedor, microcrédito, ahorro) sin repetir el consentimiento en su billetera. Además, el pitch usaba cifras sin fuente que no coincidían con la documentación del proyecto.

## Prompt de ingeniería (versión refinada)

> 1. **Repartos editables:** expón `PUT /api/merchants/:id/rules` para reemplazar las reglas de un comercio. Conserva siempre lo abonado de cada regla. El saldo de una deuda solo cambia si el comercio envía uno nuevo, para que una edición nunca deshaga un abono registrado entre tanto. Aplica las mismas restricciones del onboarding: máximo 50 % en total, de 1 a 5 reglas y nunca la billetera propia como destino. No pidas un nuevo consentimiento: el grant solo limita el tope diario (ADR 0004).
> 2. **Escritura atómica en PostgreSQL:** actualiza las reglas en una sola transacción que preserve `repaid` y evite choques con la posición única al reordenarlas.
> 3. **Editor en la caja:** reutiliza el editor del onboarding con una vista previa de cómo se repartiría una venta de 10.000 COP.
> 4. **Tendero de demo:** crea `npm run demo:merchant` para registrar la tienda con las billeteras del equipo e imprimir el enlace de consentimiento.
> 5. **Cifras:** contrasta las cifras del pitch con fuentes oficiales (DANE EMICRON y GEIH) y corrige la documentación desactualizada tras mover el backend a `backend/`.

## Resultado

- Endpoint, editor y script de demo, con pruebas en memoria y contra PostgreSQL, incluida una deuda ya pagada que se conserva al editar.
- Cifras corregidas: 5,3 millones de micronegocios (EMICRON 2024); 10,1 millones de trabajadores por cuenta propia, el 41,3 % de los ocupados (GEIH, junio de 2026); y tasas del gota a gota de hasta 20 % mensual, más de 790 % anual, frente a un tope legal de 87,62 %.
