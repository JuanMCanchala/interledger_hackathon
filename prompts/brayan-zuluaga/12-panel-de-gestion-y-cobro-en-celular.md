# Prompt 12 — Panel de gestión del tendero y cobro desde el celular

**Fecha:** 17 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

La caja solo servía para cobrar y ver el día. El tendero necesitaba un panel completo, usable desde el celular cuando no tiene computador. Debía tener metas con gráficos y todas las configuraciones. Además, una forma de pasar el cobro del computador al celular para mostrárselo al cliente.

## Prompt de ingeniería (versión refinada)

> 1. Convierte la caja en un panel de gestión pensado primero para el celular, con secciones de inicio, vender, metas, repartos y ajustes.
> 2. Muestra metas con gráficos ligeros: cuota mensual de cada obligación, meta de ahorro opcional por billetera y meta de ventas del mes (configurable). Incluye la proyección según el ritmo del mes.
> 3. Al crear una venta, muestra un QR que el tendero escanea con su celular para abrir una pantalla de cobro con el QR de pago e información en vivo, y un botón para abrirla directamente.
> 4. Permite editar todas las configuraciones; cambiar el límite mensual debe pedir una nueva autorización en la billetera.
> 5. Entrega commits atómicos, con pruebas y documentación.

## Decisiones tomadas con el usuario

- Pantalla de cobro pública por venta (`/cobro?sale=`), sin sesión: solo muestra esa venta.
- Metas: cuotas mensuales, meta de ahorro con monto objetivo y meta de ventas del mes como ajuste opcional.
- Gráficos en SVG propio, sin librerías.
- Todo es editable; el límite mensual pide una nueva autorización y el permiso actual sigue activo hasta que se aprueba.

## Resultado

- **Backend:** meta de ahorro por regla y meta de ventas del mes (`PUT /settings`). Cambio de límite con un permiso pendiente que reemplaza al actual al aprobarse y revoca el anterior (`POST /cap`). Datos del mes por día en el dashboard. 125 pruebas en verde contra PostgreSQL.
- **Web:** panel con barra de pestañas inferior en el celular y superior en el computador. Incluye gráfico de ventas del mes contra el ritmo de la meta, reparto del mes por categoría, anillos de metas con proyección, montos rápidos, QR para el celular del tendero o QR de pago en pantalla, y ajustes completos. Nueva pantalla `/cobro` a pantalla completa. Se verificó con jsdom, sin abrir Chrome.
