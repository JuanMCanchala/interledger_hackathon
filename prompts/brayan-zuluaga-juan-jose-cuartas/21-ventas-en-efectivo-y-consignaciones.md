# 21 · Ventas en efectivo y consignaciones

## Objetivo

Que el tendero registre las ventas en efectivo para que cuenten y se repartan, sin que MiPlante
envíe nunca dinero que no está en la billetera: los repartos del efectivo esperan a que el tendero
lo consigne.

## Requisitos

1. **Venta en efectivo** (ADR 0019): se registra como pagada (Vender con "En efectivo" o GlorIA),
   suma a ventas, meta y ganancia real, y se reparte con las reglas; sus repartos quedan en estado
   `cash`, sin enviarse, y cuentan contra el límite mensual y la deuda.
2. **Solo se consignan los repartos**: Inicio muestra "Por consignar" (la suma de los repartos en
   efectivo) y el detalle por proveedor o ahorro; el resto del efectivo es del tendero.
3. **Consignación declarada**: libera los repartos más antiguos completos; los ahorros salen por
   Open Payments, los de proveedores quedan apartados para su día de pago (o se pagan ya si ese pago
   del mes ya salió); lo que sobra queda como crédito para los siguientes.
4. **GlorIA**: entiende "vendí 15 mil en efectivo" y "consigné 50 mil" en el dispositivo (antes que
   el cobro por QR) y con dos herramientas estrictas en DeepSeek; conoce lo que falta por consignar.
5. La pantalla fija nunca muestra ventas en efectivo; el historial las marca como "Efectivo".
6. Migración, pruebas (backend con PostgreSQL, frontend en jsdom, verificación en vivo con DeepSeek),
   ADR 0019, API y ADR 0017 al día.
