# Prompt 14 — Correcciones del reporte de QA y pruebas E2E

**Fecha:** 17 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

Un reporte de QA manual dejó 7 hallazgos y 2 riesgos sin verificar. Los prioritarios eran el polling excesivo (3) y la vista previa con saldo negativo (7). Además, se necesitaba una prueba de punta a punta del producto.

## Prompt de ingeniería (versión refinada)

> 1. Corrige primero el polling excesivo y la vista previa de repartos con montos negativos.
> 2. Resuelve los hallazgos de bajo costo del reporte: id malformado en `/cobro`, montos sin mínimo ni máximo, campos numéricos inconsistentes y formato de montos en los errores.
> 3. Verifica los riesgos R1 (validación solo en el cliente) y R2 (acceso entre comercios) con pruebas, no con suposiciones.
> 4. Escribe una prueba E2E del recorrido completo y una prueba de humo contra la app en ejecución. Entrega commits atómicos.

## Resultado

- **3:** el polling se pausa con la página oculta. Una venta solo se consulta con "Vender" abierto (cada 1 s, luego cada 3 s y cada 10 s según su antigüedad), y el panel refresca cada 30 s en reposo. Se verificó contando peticiones en jsdom.
- **7:** la vista previa nunca reparte más que la venta; la parte de la tienda llega como mínimo a $ 0.
- **1:** un id que no es UUID responde 404 en vez de 500.
- **2, 4 y 5:** la venta va en pesos enteros, de $ 100 a $ 100.000.000, con el mismo formato que los otros campos; el servidor rechaza montos gigantes con un mensaje claro.
- **6:** los mensajes muestran "$ 300.000".
- **R1 y R2:** se confirmaron seguros. El servidor rechaza los datos inválidos por sí mismo, y otra cuenta recibe 404 (401 sin sesión) en cada ruta de la tienda.
- **Pruebas:** `tests/e2e.test.ts` cubre el mes de una tienda por HTTP; `npm run e2e:smoke` corre contra la app real (31 comprobaciones en verde). En total, 138 pruebas en verde.
