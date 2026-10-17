# 17 — Despliegue en Coolify

- **Fecha:** 2026-10-17
- **Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

El producto corría en Render y Railway. Se necesitaba un despliegue propio en un servidor con
Coolify, desde el repositorio público del equipo, primero con una URL provisional para validar y
luego con el dominio definitivo. Cualquier ajuste de infraestructura debía ir en una rama aparte
creada desde `dev`.

## Prompt de ingeniería (versión refinada)

> 1. Analiza la infraestructura actual (Dockerfiles, compose de desarrollo, configuración de nginx y
>    variables de entorno) y determina qué falta para desplegar en Coolify sin modificar el código
>    de la aplicación.
> 2. Crea la rama `deploy/coolify` desde `origin/dev` en un worktree aislado y agrega un compose de
>    producción: PostgreSQL con credenciales generadas por Coolify, backend con migraciones al
>    arrancar y frontend nginx como única entrada pública que proxea la API por la red interna.
> 3. Pasa la llave privada de Open Payments como variable en base64, nunca como archivo en la
>    imagen, y verifica que corresponda a la llave pública del Key ID antes de usarla.
> 4. Usa la API de Coolify para crear la aplicación en el proyecto existente, cargar las variables,
>    asignar un dominio provisional con HTTPS y lanzar el despliegue.
> 5. Verifica salud, rutas proxeadas y certificado TLS; documenta el procedimiento en `docs/COOLIFY.md`.

## Resultado

- Rama `deploy/coolify` con `docker-compose.coolify.yml` y `docs/COOLIFY.md`; no se tocó el código.
- Aplicación creada por API en el proyecto `miplante` de Coolify (build pack Docker Compose).
- URL provisional `https://miplante.2.25.76.134.sslip.io` con certificado de Let's Encrypt;
  `/api/health`, `/`, `/login` y `/pay` responden 200.
- Se descartó el subdominio `sslip.io` en HTTP: la cámara para el QR y el service worker exigen un
  origen seguro. Pendiente: pasar al dominio definitivo (actualizar el dominio del servicio
  frontend y `PUBLIC_BASE_URL`, y volver a desplegar) y rotar el token de la API.
