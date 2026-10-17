# Prompt 08 — Optimización de la latencia del cobro y el reparto

**Fecha:** 16 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

En la primera prueba real, el pago tardó en reflejarse en la caja. Antes de optimizar había que medir dónde se iba el tiempo.

## Prompt de ingeniería (versión refinada)

> 1. Mide la latencia de cada tramo de una venta real: lo que tarda el cliente en su billetera, la detección del pago y el reparto. Usa las marcas de tiempo de la base y de la incoming payment.
> 2. Reduce las llamadas de red repetidas: cachea las búsquedas de billeteras e incluye en la caché los tokens de grants no interactivos hasta poco antes de su vencimiento, con un reintento ante un 401.
> 3. Cobra las reglas del reparto en paralelo, sin perder el registro progresivo de lo que ya se movió.
> 4. Evita consultas simultáneas a la misma billetera desde la caja, el panel y el sweeper, y acorta el intervalo de consulta de la caja sin acumular peticiones.

## Resultado

- **Medición inicial:** 56 s del lado del cliente, 4 s de detección y 10 s de reparto.
- **Tras la optimización:** cada revisión de pagos bajó de 1,5 s a unos 0,9 s, y las billeteras ya consultadas se responden desde la caché (200 ms → 0 ms). El reparto pasa de unas 10 llamadas de red por regla a unas 5, y las reglas se cobran en paralelo.
