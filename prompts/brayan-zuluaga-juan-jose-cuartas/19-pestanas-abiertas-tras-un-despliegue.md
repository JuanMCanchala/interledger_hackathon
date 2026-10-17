# 19 — Pestañas abiertas tras un despliegue

- **Fecha:** 2026-10-17
- **Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

Al desplegar GlorIA en Coolify (con `DEEPSEEK_API_KEY` validada contra la API de DeepSeek), el
navegador mostró `Failed to fetch dynamically imported module` al navegar: una pestaña con el build
anterior pedía un chunk perezoso que el build nuevo ya no publica.

## Prompt de ingeniería (versión refinada)

> 1. Confirma que el chunk pertenece a un build anterior (404 y ausente del `ngsw.json` vigente).
> 2. Haz que la SPA se recupere sola: ante un error de chunk obsoleto en la navegación, pide al
>    service worker la versión nueva y recarga esa URL una sola vez, sin bucles.
> 3. Aplica una versión nueva lista en el service worker en la siguiente navegación, como carga
>    completa, nunca en medio de una venta; recarga si el service worker queda irrecuperable.
> 4. Cubre la detección del error con tests, compila en producción, integra en `dev` y despliega.

## Resultado

- `frontend/src/app/core/app-updates.ts`, registrado en `app.config.ts`, con su spec; 36 tests
  pasan y el build de producción compila.
- Rama `fix/stale-chunks-after-deploy` integrada en `dev` (`5d3b6d3`) y desplegada en Coolify.
- Se descartó recargar apenas llega una versión nueva: interrumpiría al tendero en plena venta.
- Las pestañas abiertas antes de este despliegue aún tienen el código viejo y necesitan una recarga
  manual una vez; de ahí en adelante se recuperan solas.
