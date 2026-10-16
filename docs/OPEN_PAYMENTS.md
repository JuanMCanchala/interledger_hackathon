# Capa de Open Payments

Backend en Node + TypeScript que implementa el flujo obligatorio del hackatón con el SDK oficial
`@interledger/open-payments` 7.4.0. No depende de la idea final: cualquier frontend (web, bot de
WhatsApp, agente) lo usa por HTTP.

## Qué cubre

| Flujo                                 | Para qué sirve                                                                                                                         | Pasos de Open Payments                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Pago único**                        | Un pago con consentimiento en el momento                                                                                               | pago entrante → cotización → grant interactivo → pago saliente → confirmación                         |
| **Autorización recurrente** (mandato) | Aprobar una vez un tope de débito, opcionalmente por periodo (semanal, quincenal...), y cobrar varias veces sin volver a pedir permiso | grant interactivo con `limits.debitAmount` + `limits.interval` → N pagos salientes con el mismo token |
| **Cobro dividido**                    | Repartir un pago entre varias wallets bajo la misma autorización                                                                       | N pagos salientes secuenciales contra el mismo tope                                                   |

Incluye: verificación del hash de la interacción (GNAP), recotización si la cotización vence mientras
el usuario aprueba, rotación automática del token, revocación, consulta de lo gastado en el periodo
y lista blanca de hosts de wallets.

## 1. Preparar el test wallet (una vez)

1. Crea una cuenta en <https://wallet.interledger-test.dev> (los datos de KYC pueden ser de prueba,
   salvo el correo).
2. Crea una cuenta por moneda que necesites y deposita saldo de prueba.
3. Crea al menos tres wallet addresses:
   - **app**: la identidad de nuestra aplicación (la que firma las peticiones);
   - **quien paga** y **quien recibe**, para la demo.
4. En la wallet address de la app: **Settings → Developer Keys → Generate**. Descarga
   `private.key` a la raíz del repo (está en `.gitignore`) y copia el **Key ID**.

## 2. Configurar y correr

```bash
npm install
cp env.example .env        # completa OP_CLIENT_WALLET_ADDRESS y OP_KEY_ID
npm run check:wallet -- '$ilp.interledger-test.dev/quien-paga' '$ilp.interledger-test.dev/quien-recibe'
npm run dev                # http://localhost:3000
```

`check:wallet` confirma que las wallets existen, muestra su moneda y verifica que la llave y el key
ID están bien registrados.

## 3. Probar el flujo (y grabar la demo)

Abre <http://localhost:3000>. La página sandbox muestra los cuatro pasos que exige la demo:

1. **Solicitud de pago**: llena quien paga, quien recibe y monto → _Pagar con Open Payments_.
2. **Autorización**: el navegador va al test wallet; inicia sesión con la cuenta de quien paga y
   aprueba.
3. **Ejecución**: el test wallet vuelve a `/api/payments/:id/callback`, que verifica el hash y crea
   el pago saliente.
4. **Finalización**: la página consulta el estado hasta que el pago entrante queda completo.

Para la autorización recurrente, elige el periodo _Cada minuto (demo)_ para mostrar en vivo que el
tope se renueva.

> El regreso del consentimiento va al navegador del usuario. Si la demo se abre desde otro
> dispositivo (por ejemplo un celular), expón el servidor con un túnel (`cloudflared` o `ngrok`) y
> pon esa URL en `PUBLIC_BASE_URL`.

## API

Montos en decimal (`"12.50"`); las wallet addresses aceptan `$...` o `https://...`.

| Método | Ruta                        | Cuerpo                                                                                                             | Respuesta                                                        |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| GET    | `/api/wallet-address?url=`  | —                                                                                                                  | moneda y escala de la wallet                                     |
| POST   | `/api/payments`             | `{ sender, receiver, amount, description? }` (monto en moneda de quien recibe)                                     | `{ payment, redirectUrl }` → redirige al usuario a `redirectUrl` |
| GET    | `/api/payments/:id`         | —                                                                                                                  | estado actualizado + `steps` (los cuatro pasos de la demo)       |
| POST   | `/api/mandates`             | `{ sender, maxAmount, interval?, repetitions?, description? }` (`interval` ISO 8601: `PT1M`, `P1W`, `P15D`, `P1M`) | `{ mandate, redirectUrl }`                                       |
| GET    | `/api/mandates/:id`         | —                                                                                                                  | autorización, gastado en el periodo y cobros                     |
| POST   | `/api/mandates/:id/charges` | `{ receiver, amount, amountType?, description? }`                                                                  | pago creado                                                      |
| POST   | `/api/mandates/:id/split`   | `{ receivers: [{ receiver, amount }], amountType?, description? }`                                                 | resultado por destinatario                                       |
| DELETE | `/api/mandates/:id`         | —                                                                                                                  | autorización revocada                                            |

`amountType`: `receive` (por defecto, el destinatario recibe exactamente el monto, en su moneda) o
`send` (el remitente paga exactamente el monto, en su moneda).

Los callbacks (`/api/payments/:id/callback`, `/api/mandates/:id/callback`) los llama el test wallet,
no el frontend. Al terminar redirigen a `FRONTEND_URL` con `?payment=<id>` o `?mandate=<id>`.

## Cómo encaja cada idea

| Idea                       | Flujo                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Natillera / cadena         | Cada miembro aprueba una autorización semanal → cobro al fondo cada periodo → pago al miembro de turno |
| Cuaderno del fiado         | El vecino aprueba un tope quincenal → la tienda cobra lo fiado en la quincena                          |
| Mesada familiar            | Autorización mensual del familiar en el exterior → cobro dividido (mamá, colegio, ahorro)              |
| Asistente por voz con tope | La familia aprueba el tope → el asistente cobra dentro del límite                                      |
| Báscula que paga           | Autorización de la bodega → pago por kilo al reciclador + parte a la asociación (split)                |
| Avance de obra             | Autorización por el presupuesto total → un cobro por etapa                                             |
| Propinas Comuna 13         | Pago único del turista (USD) → artista recibe COP; o split entre el grupo                              |

## Código

```
src/
  config.ts                  variables de entorno validadas con zod
  server.ts                  arranque
  http/app.ts, schemas.ts    rutas Express y validación de entrada
  openPayments/
    operations.ts            cada paso de Open Payments como una llamada al SDK
    flows.ts                 orquestación: pago único, autorizaciones, cobros, split
    hash.ts                  verificación del hash de la interacción (GNAP)
    amounts.ts, interval.ts  montos en unidades mínimas e intervalos ISO 8601
    walletAddress.ts         normalización de $ → https y lista blanca de hosts
    store.ts                 persistencia en data/store.json (fuera de git: tiene tokens)
public/index.html            página sandbox para probar y grabar la demo
scripts/check-wallet.ts      diagnóstico de la configuración
tests/                       vitest con un doble de la API de Open Payments
```

## Detalles que ya resuelve

- **Wallet addresses**: el SDK necesita `https://`; el formato `$` del wallet se convierte solo.
- **Hash de la interacción**: el test wallet (Rafiki) lo calcula como base64 con relleno sobre
  `authServer/tenantId`; la verificación acepta también la variante sin relleno.
- **Cotizaciones que vencen**: si el usuario tarda en aprobar, se recotiza y se rechaza si el nuevo
  costo supera lo autorizado.
- **Tokens**: se rotan antes de vencer y otra vez si la wallet responde 401.
- **Seguridad**: el servidor solo llama a hosts de `OP_ALLOWED_WALLET_HOSTS`; la API nunca devuelve
  tokens ni nonces; llaves, `.env` y `data/` están en `.gitignore`.
