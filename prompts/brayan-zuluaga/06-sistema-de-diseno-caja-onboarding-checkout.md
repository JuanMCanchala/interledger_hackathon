# Prompt 06 — Sistema de diseño en la caja, el onboarding y el checkout

**Fecha:** 16 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

Tras integrar la landing, las pantallas de la app (caja, onboarding y checkout) aparecían sin estilos en desarrollo y conservaban la apariencia anterior a la marca.

## Prompt de ingeniería (versión refinada)

> 1. Diagnostica por qué la caja se ve sin estilos con `ng serve` y corrígelo de raíz.
> 2. Aplica a la caja, el onboarding y el checkout el sistema de diseño de la landing (`frontend/src/styles.scss`): fondo verde monte con textura de papel, tarjetas color papel, tipografía Lexend con títulos pequeños en manuscrita, botones lima en forma de píldora y la paleta de la marca en estados y barras. Hazlo reasignando los tokens semánticos existentes en dos contextos: sobre la página verde y sobre las tarjetas.
> 3. Verifica el resultado con capturas en escritorio y en ancho de celular (390 px).

## Resultado

- **Causa:** `ng serve` publicaba su propio `/styles.css`, que ocultaba el de la caja. Los recursos del backend pasaron a `/css/miplante.css` y `/js/app.js`.
- Las tres pantallas usan los tokens de la marca. Se revisaron en escritorio y en 390 px, sin desbordes.
