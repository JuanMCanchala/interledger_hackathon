# 19 · GlorIA: asistente de la tienda con IA y voz

## Objetivo

Integrar en la caja de MiPlante a **GlorIA**, una asistente conversacional sobre DeepSeek V4.1 Flash
(`deepseek-flash`), cálida, profesional y fácil de usar por tenderos, con voz de punta a punta.

## Requisitos

1. **Backend**
   - Puerto `ChatModel` con adaptador DeepSeek (API compatible con OpenAI, tool calling), con el
     razonamiento desactivado (`thinking: disabled`) por latencia; tiempo límite de 20 s.
   - `GloriaService`: herramientas de solo lectura sobre el dashboard (resumen, obligaciones,
     ahorros, avisos, ventas recientes, límite mensual), con cifras ya formateadas en pesos.
   - Acciones solo como borradores que el tendero confirma: `preparar_cobro` (100 a 100 millones,
     con autorización activa) y `abrir_seccion`. Nunca mueve dinero.
   - Minimización de datos: nunca enviar al modelo URLs de billetera, tokens ni IDs.
   - `POST /api/merchants/:id/assistant`, solo para el dueño de la tienda; 20 preguntas por minuto;
     `503` sin clave; errores amables y log en el servidor.
   - Persona: frases cortas, sin markdown, sin inventar cifras, sin asesoría de inversión, sin
     asumir género, y diciendo que abre una sección solo si de verdad llama la herramienta.
2. **Frontend (Angular, standalone, OnPush, signals, sistema de diseño MiPlante)**
   - `VoiceService` en el dispositivo: voz es-CO, dictado con Web Speech API, campanita WebAudio y
     vibración; anuncios activables y recordados por equipo.
   - `parseSpokenSale` y `pesosInWords` para montos hablados en español colombiano.
   - Componente `app-gloria`: botón flotante, diálogo accesible (Escape, foco, `aria-live`),
     sugerencias, micrófono, respuestas en voz alta y botones de acción para los borradores.
   - Integración en la caja: borrador de venta en Vender (sin cobrar solo), dictado del monto,
     aviso hablado al recibir un pago y al enviar o fallar un pago a proveedores, y tarjeta
     "Voz y sonido" en Ajustes.
3. **Calidad y documentación**: pruebas (backend con modelo guionado, frontend en jsdom), ADR 0017
   con privacidad y Ley 1581, ruta en `docs/API.md`, variables en `env.example` y el README.
4. **Secretos**: la clave solo en `.env` ignorado por git; nunca en commits ni en el chat.
5. Commits atómicos con el usuario como único autor.
