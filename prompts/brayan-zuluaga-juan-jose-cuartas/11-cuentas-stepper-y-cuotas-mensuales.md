# Prompt 11 — Cuentas, configuración por pasos y cuotas mensuales

**Fecha:** 17 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

El registro era un solo formulario con un límite diario, y la caja se abría con un código guardado en el dispositivo. Los tenderos piensan sus obligaciones por mes: hacía falta que, una vez cubierta la cuota del mes de cada obligación, el resto de las ventas fuera ganancia.

## Prompt de ingeniería (versión refinada)

> 1. Añade cuentas sencillas para tenderos: registro e inicio de sesión con correo y contraseña. Guarda la contraseña con un hash de Node (scrypt) y usa un token de sesión. Cada tienda pertenece a la cuenta que la registró.
> 2. Rehaz el registro de la tienda como un stepper de tres pasos: datos de la tienda; billeteras por categoría (Proveedores, Microcréditos, Ahorro y categorías propias, con varias billeteras cada una); y límite mensual con resumen.
> 3. Cambia el límite diario por uno mensual, aprobado una sola vez en la billetera. Cada obligación toma su porcentaje de cada venta hasta completar su cuota del mes; después, todo lo recibido es ganancia. El ahorro siempre toma su porcentaje.
> 4. Refleja el progreso de cada cuota en la caja, actualiza la documentación y entrega commits atómicos.

## Decisiones tomadas con el usuario

- Contraseñas con `scrypt` de `node:crypto`, sin dependencias nuevas.
- Reparto por porcentaje de cada venta hasta cubrir la cuota mensual.
- El ahorro no tiene cuota.
- El grant de Open Payments tiene un tope mensual (`interval` `R/<día 1>/P1M`).

## Resultado

- **Backend:** rutas `/api/auth/register|login|logout|me`, sesiones de 30 días con Bearer token, y tiendas visibles solo para su dueño (404 para otras cuentas). Migración `accounts`, con 116 pruebas en verde contra PostgreSQL.
- **Web:** páginas `/login` y `/register`. El stepper de tres pasos valida cada paso y sugiere un límite que cubre las cuotas. La caja agrupa las reglas por categoría y muestra "pagado X de Y este mes"; "Editar repartos" admite categoría y cuota. El stepper y la caja se verificaron con jsdom y el payload contra el esquema real, sin abrir Chrome.
- **Docs:** API.md, ADR 0013, README, DEMO y SYSTEM_DESIGN pasan a límite mensual y cuentas.
