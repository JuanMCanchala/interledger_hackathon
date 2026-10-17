# Prompt 05 — Integración de la landing en Angular bajo un solo dominio

**Fecha:** 16 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

La rama `frontend` trae la landing definitiva (Angular, GSAP y PWA) con el sistema visual de la marca. El frontend en Next.js cumplía además otra función: servir de proxy hacia el backend, para que los QR y los callbacks de consentimiento de las billeteras usaran una sola URL.

## Prompt de ingeniería (versión refinada)

> 1. Reemplaza el scaffold de Next.js por la app Angular de la rama `frontend`, sin alterar su diseño.
> 2. Conserva el dominio único:
>    - **Producción:** nginx sirve el build y reenvía al backend `/api`, `/css`, `/js`, `/img` y las páginas de la app. Lee `BACKEND_INTERNAL_URL` y `PORT` al arrancar el contenedor.
>    - **Desarrollo:** `ng serve` hace lo mismo con `proxy.conf.mjs`, usando polling para los bind mounts en Windows.
> 3. Evita que el service worker de la PWA responda con la landing a las navegaciones del backend, en particular al callback de consentimiento de la billetera.
> 4. Conecta los botones de la landing con el onboarding, la caja y el sandbox.
> 5. Ajusta Docker, Railway, el CI y la documentación (ADR 0011). Deja registrado que el backend es Express, no NestJS.

## Resultado

- Landing integrada en `frontend/` con nginx en producción y `ng serve` en desarrollo. El callback de consentimiento ya no queda atrapado por el service worker.
- Cuando el equipo publicó una copia de la landing en un contenedor aparte (`landing/`), se integraron sus ajustes de diseño en `frontend/` y se eliminó el duplicado.
