# 18 — El service worker y las páginas del backend

- **Fecha:** 2026-10-17
- **Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

En producción, abrir "Registra tu negocio" o "Entra a tu caja" devolvía al usuario a la pantalla
de inicio. Además había que desplegar en Coolify los últimos cambios de `dev`.

## Prompt de ingeniería (versión refinada)

> 1. Reproduce la redirección de `/login` y `/register` al inicio y aísla su causa entre nginx, el
>    router de Angular y el service worker.
> 2. Corrige en una rama propia desde `origin/dev`, manteniendo sincronizadas las rutas del backend
>    en nginx, el proxy de desarrollo y la configuración del service worker.
> 3. Integra `dev` y la corrección en `deploy/coolify`, despliega por la API de Coolify y verifica
>    que el `ngsw.json` publicado excluye las páginas del backend.

## Resultado

- Causa: `navigationUrls` de `ngsw-config.json` solo excluía `/api` y `/js`. Una vez instalado, el
  service worker respondía `/login`, `/register`, `/onboard`, etc. con `index.html`, y la ruta
  comodín de Angular redirigía al inicio. Con curl funcionaba porque no hay service worker.
- Corrección en la rama `fix/sw-backend-pages`: excluye `/css`, `/img` y todas las páginas del
  backend. Además, el comentario de `proxy.conf.mjs` ahora pide mantener las tres listas sincronizadas.
- `deploy/coolify` integra `dev` (incluida la migración de revisión de pagos) y la corrección.
  Desplegado y verificado: salud OK, `ngsw.json` con 21 exclusiones y las páginas responden 200.
- Luego se integró todo en `dev` (avance rápido a `63cf15e`), Coolify pasó a desplegar desde `dev`
  con el dominio `app.miplante.online`, y se verificó en Chrome que "Abrir mi caja" y "Registra tu
  negocio" abren `/login` y `/register`. Los navegadores que conservan el service worker instalado
  cuando el dominio apuntaba a Railway pueden seguir redirigiendo hasta que se actualice o se
  borren los datos del sitio.
