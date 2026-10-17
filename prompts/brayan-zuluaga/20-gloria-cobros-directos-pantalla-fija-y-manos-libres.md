# 20 · GlorIA: cobros directos, pantalla fija, manos libres y DeepSeek preciso

## Objetivo

Que GlorIA sea confiable y profesional en el mostrador: que cobre y navegue sin fallos, que el
celular del mostrador muestre siempre el cobro vigente, que se pueda usar sin manos y que aproveche
DeepSeek V4.1 Flash (sin razonamiento) con la máxima precisión.

## Requisitos

1. **Resiliencia del modelo**: un reintento ante cortes de conexión o modelo ocupado, con la causa
   exacta en el log.
2. **Pantalla fija de cobro (ADR 0018)**: enlazar un celular una vez (clave aleatoria por tienda,
   rotable) para que muestre el QR de cada cobro nuevo, celebre el pago, no se apague y no dé acceso
   a la caja. Ruta pública `GET /api/displays/:key` con la vista pública de la venta.
3. **Cobros y navegación directos**: "cobra 50.000", "haz un cobro de $50,000", "llévame a inicio"
   se interpretan en el dispositivo, sin depender del modelo; el chat se minimiza y una nota junto al
   botón dice lo que hizo. Si la caja no puede cobrar, GlorIA dice por qué. Las preguntas sobre
   cobros no generan cobros.
4. **Manos libres**: escucha continua de «Gloria» con resultados parciales, tolerante a cómo se
   transcribe su nombre, reinicio inmediato de sesiones, sin escuchar su propio eco, con indicadores
   visibles y aviso de privacidad. Voz femenina en español, colombiana primero.
5. **Chat rediseñado** según el sistema de diseño: legible, sin desbordes, con estado y transcripción
   en vivo.
6. **DeepSeek preciso**: estado actual de la tienda en el prompt (una sola llamada), herramientas en
   modo estricto (beta), temperatura baja, persona fija para la caché de contexto y la sección en
   pantalla como contexto. Verificar en vivo.
7. Pruebas (jsdom, simulación del reconocimiento de Chrome, backend con PostgreSQL), ADRs y API al
   día; commits atómicos con el usuario como único autor y subida a dev.
