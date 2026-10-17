# Prompt 15 — Revisión de calidad y eliminación de código muerto

**Fecha:** 17 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

Después de varias iteraciones rápidas, el código acumulaba restos de versiones anteriores (la caja vieja, el límite diario, el historial de 7 días). Además, no había tenido una revisión de calidad independiente.

## Prompt de ingeniería (versión refinada)

> 1. Elimina el código sin uso en backend, cliente web y landing: exports, funciones, CSS, campos de la API que nadie lee y dependencias.
> 2. Haz una revisión de calidad enfocada en bugs de dinero, carreras, seguridad y comentarios desactualizados. Verifica cada hallazgo leyendo el código antes de corregirlo.
> 3. Corrige lo confirmado con una prueba que falle sin el arreglo. Entrega commits atómicos.

## Resultado

- **Código muerto:**
  - `history` y `today.byRule` del dashboard.
  - 13 grupos de CSS.
  - `localDate` y `absoluteUrl`.
  - Duplicados unificados: `moneyInput` y los límites de repartos.
  - Dependencias: `pg`, `@types/pg` y `@vitest/coverage-v8`.
  - `WIDE` en la landing.
- **Seguridad:** las rutas públicas del sandbox permitían cobrar contra el permiso de una tienda, y la lectura pública de la venta revelaba su id. Ahora un permiso de tienda no existe para el sandbox, y la venta y el pago públicos ya no exponen esos ids.
- **Dinero:**
  - Un pago a acreedor ya no puede salir dos veces (un candado por tienda, y el saldo se lee dentro).
  - El pago nunca supera el saldo de la deuda.
  - El tope mensual se respeta aunque el permiso no haya gastado nada.
  - Guardar ajustes ya no borra pagos registrados.
  - No se puede quitar una deuda con dinero apartado.
  - El ahorro cuenta cuando el dinero llega.
- **Web:** la redirección después de iniciar sesión ya no acepta otros sitios.
- **Pruebas:** 146 en verde contra PostgreSQL, la prueba de humo contra la app real pasa y las 6 pruebas de interfaz en jsdom pasan.
