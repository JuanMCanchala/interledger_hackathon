# Prompt 03 — Estructuración del Repositorio en Directorios Independientes (`frontend/` y `backend/`)

## Contexto y Objetivo
Para mantener una separación clara de responsabilidades entre la interfaz web en Next.js y el motor de pagos y liquidación automática con Interledger Open Payments + Prisma/PostgreSQL, necesitamos organizar el repositorio en dos directorios de primer nivel (`frontend/` y `backend/`), manteniendo la orquestación unificada mediante Docker Compose en la raíz.

## Prompt de Ingeniería (Versión Refinada)
> Reestructura el repositorio para separar explícitamente los servicios de aplicación en dos carpetas principales: `frontend/` y `backend/`:
>
> 1. **Servicio Backend (`backend/`)**:
>    - Mueve mediante `git mv` los directorios `src/`, `tests/`, `prisma/`, `public/`, `scripts/`, y los archivos `prisma.config.ts`, `tsconfig.json`, `package-lock.json` y `Dockerfile.backend` (hacia `backend/Dockerfile`) preservando el historial de Git como renombrados puros (`R100`).
>    - Define `backend/package.json` con las dependencias de `@interledger/open-payments`, `@prisma/client`, `@prisma/adapter-pg`, `express` y `zod`, junto con `backend/.dockerignore`.
>    - Conserva un `package.json` ligero en la raíz con scripts delegados (`npm --prefix backend ...`, `npm --prefix frontend ...`, `docker:up`, `docker:down`) para facilitar el flujo de trabajo desde la raíz del proyecto.
> 2. **Orquestación e Integración Continua**:
>    - Actualiza `docker-compose.yml` para que el servicio `backend` construya desde `context: ./backend` (`dockerfile: Dockerfile`) y monte los volúmenes de desarrollo desde `./backend/src`, `./backend/public` y `./backend/prisma`.
>    - Actualiza `.github/workflows/ci.yml` con `working-directory: backend` y `cache-dependency-path: backend/package-lock.json`.
>    - Actualiza `.gitignore` para excluir `backend/node_modules/` y `backend/src/generated/`.
> 3. **Verificación y Commit Atómico**:
>    - Verifica que `npm run typecheck`, `npm test` y `docker compose up -d --build` funcionen correctamente.
>    - Realiza commits atómicos siguiendo Conventional Commits y sincroniza con la rama `dev`.
