# Juan Manuel Canchala · prompts

Integración de Open Payments, arquitectura y documentación del repositorio, despliegue (Docker, Railway, Coolify) y control de calidad de lo que pasa a producción.

- **Herramienta:** Claude Code (Anthropic) con **Claude Opus 5.5**, en una sola sesión del 16 al 17 de octubre de 2026, con subagentes para investigación y revisión de código.
- Los prompts más importantes, en su **versión refinada de ingeniería**, agrupados por fase. El texto original de cada uno, con su ortografía, está al final.

## 1. Investigación y estrategia

**Contexto:** Arranque del hackatón, sin idea definida.

**Prompt de ingeniería (versión refinada)**

> Investiga con subagentes en paralelo y con búsqueda web:
> 1. Los ganadores de ediciones anteriores de los hackatones de Interledger y qué tenían en común.
> 2. Los tracks y patrocinadores de esta edición, y qué premia cada uno.
> 3. Los ganadores de hackatones fintech comparables.
>
> Con esos hallazgos, propón ideas que usen Open Payments como núcleo. Para cada una indica el problema, el usuario, el flujo de pago y el premio al que apunta. Después evalúa con los mismos criterios el tablero de ideas del equipo.

**Resultado:** Un panorama de qué premian los jurados y una lista de ideas alineadas con los cuatro premios. El equipo eligió MiPlante, la idea de Brayan.

_Prompts originales: #4, #8, #9, #12._

## 2. Repositorio y flujo de entrega

**Contexto:** Había que dejar listo desde el inicio lo que exige la entrega.

**Prompt de ingeniería (versión refinada)**

> Crea el repositorio público `interledger_hackathon` en mi GitHub personal con las ramas `main`, `qa`, `prod` y `dev`: el trabajo entra por `dev` y se promueve a `qa`, `prod` y `main`. Agrega un README inicial y prepara los entregables de la política de IA (`AI_USAGE.md` y `/prompts`). El registro de prompts se mantiene fuera del control de versiones hasta la entrega final y se publica antes del cierre.

**Resultado:** El repositorio con su flujo de ramas; `prompts/` se versionó al final, como se pidió.

_Prompts originales: #2, #3, #5, #6, #7._

## 3. Open Payments primero

**Contexto:** La integración era obligatoria y la idea todavía no estaba decidida.

**Prompt de ingeniería (versión refinada)**

> Mientras el equipo elige la idea, implementa la integración obligatoria de Open Payments como una capa independiente del producto, sobre `@interledger/open-payments`:
> - Resolución y validación de wallet addresses, con una lista de hosts permitidos.
> - Incoming payments, quotes y outgoing payments.
> - Grant interactivo GNAP con verificación del hash de `finish`.
> - Grants recurrentes con tope por intervalo (`limits.debitAmount` + `interval`) y rotación de tokens.
>
> Cubre el flujo con pruebas contra un doble del SDK y publícalo en `dev`.

**Resultado:** `backend/src/openPayments/` y un sandbox funcionando antes de elegir la idea (ADR 0002).

_Prompts originales: #10, #11._

## 4. Arquitectura documentada e historial profesional

**Contexto:** MiPlante elegida: el repositorio debía explicar el proyecto por sí mismo.

**Prompt de ingeniería (versión refinada)**

> Documenta el proyecto como lo haría un equipo senior: README en inglés, el problema y la ideación, un ADR por cada decisión de arquitectura, `docs/SYSTEM_DESIGN.md` y la referencia de la API.
>
> Publícalo en commits atómicos con Conventional Commits y en el orden en que se tomaron las decisiones: problema, ideación, ADR, diseño, pruebas, código y documentación. Parte el commit inicial en commits atómicos y verifica que el árbol final quede idéntico.

**Resultado:** Los ADR 0001–0008, `SYSTEM_DESIGN.md` y `API.md`. El commit inicial quedó partido en 11 commits atómicos con el mismo árbol.

_Prompts originales: #13, #14, #15._

## 5. Integración del equipo y entorno local

**Contexto:** Brayan había dejado en `dev` la persistencia en PostgreSQL y su Docker Compose.

**Prompt de ingeniería (versión refinada)**

> Revisa la rama `dev`: el Docker Compose y lo necesario para levantar el stack completo (PostgreSQL, backend y frontend). Corrige lo que falte en commits atómicos, levanta el entorno y configura las credenciales del test wallet sin que ninguna llave entre al repositorio. Valida las llaves contra el servidor de autorización y diagnostica el error de acceso que aparece en la pantalla de consentimiento.

**Resultado:** El stack corriendo en Docker y las llaves validadas. El error de consentimiento venía de aprobar con una cuenta que no era dueña de la billetera.

_Prompts originales: #17, #19, #20, #21, #22, #23._

## 6. Experiencia para tenderos y primera venta real

**Contexto:** El público objetivo no sabe de billeteras ni de URLs.

**Prompt de ingeniería (versión refinada)**

> Los usuarios son tenderos sin conocimientos técnicos. Rediseña el registro y la caja para que nadie tenga que escribir datos técnicos: pasos guiados, nombres de billetera en lugar de URLs, porcentajes con controles visuales y errores en español sencillo que digan qué hacer.
>
> Después ejecuta una venta real de punta a punta en la red de prueba (solicitud, autorización, ejecución y finalización) y verifica cómo se reparte.

**Resultado:** El registro guiado y la primera venta real, repartida entre las billeteras del equipo.

_Prompts originales: #24, #25._

## 7. Despliegue y dominio

**Contexto:** La demo necesitaba una URL pública.

**Prompt de ingeniería (versión refinada)**

> Despliega el stack en Railway: servicios de PostgreSQL, backend y frontend; migraciones al arrancar; secretos solo como variables del servicio. Publica la app en `miplante.online` (Namecheap) con HTTPS, indícame los registros DNS que necesita cada dominio y verifica cada cambio desde fuera.

**Resultado:** MiPlante en línea en `www.miplante.online`, con HTTPS.

_Prompts originales: #27, #28, #29, #30, #31, #35, #36._

## 8. Landing y app bajo un mismo dominio

**Contexto:** La landing de Isabella y la app de Brayan vivían separadas.

**Prompt de ingeniería (versión refinada)**

> Integra la landing con la app real bajo un mismo dominio: el frontend sirve la landing y hace de proxy de la API y de las páginas de la caja. Elimina el servicio de landing sobrante, deja `app.` como alias y sirve las páginas en URLs limpias (`/onboard`, `/merchant`, `/pay`), con redirección 301 desde los enlaces `.html` que ya estén impresos en códigos QR.

**Resultado:** Un solo dominio (ADR 0011) con URLs limpias y redirecciones permanentes.

_Prompts originales: #32, #33, #34, #37, #38._

## 9. Ningún bug pasa a producción

**Contexto:** El equipo subía decenas de commits por hora: cuentas, cuotas mensuales, pagos a acreedores.

**Prompt de ingeniería (versión refinada)**

> Antes de promover `dev` → `qa` → `prod`, audita cada lote de cambios del equipo:
> - Revisiones independientes con subagentes, enfocadas en seguridad, dinero y concurrencia.
> - Reproduce cada hallazgo con una prueba que falle antes de corregirlo.
> - Recorre en el navegador el registro, la caja y el cobro.
> - Promueve solo con CI en verde y la suite contra PostgreSQL pasando.

**Resultado:** 16 correcciones antes de producción, entre ellas una ruta pública que dejaba usar el grant de la tienda a cualquiera con el link de una venta, pagos dobles a un acreedor, cuotas pagadas dos veces y un 500 en el registro con doble toque.

_Prompts originales: #39, #40, #41, #42, #43, #44, #45._

## 10. Repositorio listo para jurados y producción en Coolify

**Contexto:** Llegaron 59 commits con la migración completa a Angular.

**Prompt de ingeniería (versión refinada)**

> Integra lo que subió el equipo y deja el repositorio listo para los jurados: saca el código de terceros que no es del producto, alinea la documentación con la arquitectura real y borra las ramas ya integradas. Despliega producción en Coolify por su API, sin exponer el token, y valida cada pantalla a 390 y 1440 px.

**Resultado:** 22.000 líneas de skills de agentes fuera del repositorio, la documentación al día y producción en Coolify verificada pantalla por pantalla.

_Prompts originales: #46, #47, #48, #49._

## Registro original

Todos los prompts tal como se escribieron, en orden y con hora de Medellín (UTC−5). Se omite el comando `/compact`, y los secretos aparecen como `[REDACTADO: …]`.

<details>
<summary>Ver los 54 prompts originales</summary>

**#1 · 16 oct, 10:41**

```text
tenemos alguna carpeta de la hackthon de interledger cierto?
```

**#2 · 16 oct, 10:43**

```text
crea el repo interledger_hackathon vacio por ahora
```

**#3 · 16 oct, 10:43**

```text
en mi github personal
```

**#4 · 16 oct, 10:52**

```text
revisa ganadores de las anteriores hackathones de interledger revisa los tracks que hay para esta hackathon tambien mira ganadores de otras hacakthones similares y dame ideas para que hacer en la hackathon
```

**#5 · 16 oct, 11:14**

```text
ve creando estas ramas en el repo prod, qa, dev y haz un readme vacio
```

**#6 · 16 oct, 11:15**

```text
agrega el AI_USAGE.md y la carpeta /prompts a main
```

**#7 · 16 oct, 11:18**

```text
quita la version 00 esto lo hacemos al final mantenlo en el gitignore y antes de que termine lo subimos
```

**#8 · 16 oct, 11:21**

```text
ahora si hagamos brainstorming dame en un parrafo varias ideas de que podemos hacer
```

**#9 · 16 oct, 11:23**

```text
dame varias ideas
```

**#10 · 16 oct, 11:26**

```text
mientras elegimos la mejor idea agreguemos toda la logica para usar lo obligatorio que es openpayments
```

**#11 · 16 oct, 11:45**

```text
si súbelo a dev
```

**#12 · 16 oct, 11:45** · _Adjuntó una foto del tablero de ideas del equipo._

```text
[Image #1] cual de estas ideas ves interesante
```

**#13 · 16 oct, 12:06**

```text
si, vamos con MiPlante arma todo el readme en ingles y todo lo necesario para que en los commits se vea como una secuencia logica de pensamiento y thinking de creacion de la idea mira que arquitectura vamos a usar todo el ADR vamos a hacer todo el lineamiento correcto con los archivos tipicos el system_design.md y todo eso dejemoslo bien ordenadito
```

**#14 · 16 oct, 12:31**

```text
recuerda subir todo en commits atomicos y dejando todo esos commits de nivel profesional
```

**#15 · 16 oct, 12:52**

```text
si si parte el primer commit en los commits atomicos
```

**#16 · 16 oct, 13:28**

```text
haz pull del repo
```

**#17 · 16 oct, 13:36**

```text
en dev brayan dejo la rama dev revisa el docker y lo que necesitamos para levantar
```

**#18 · 16 oct, 15:12**

```text
# Copia este archivo como .env y completa los valores (ver docs/OPEN_PAYMENTS.md):
#   cp env.example .env

# Wallet address de la APP (donde generaste las developer keys). Acepta $ o https://
OP_CLIENT_WALLET_ADDRESS=https://ilp.interledger-test.dev/tienda-billeticos
# Key ID que muestra el test wallet en Settings → Developer Keys
OP_KEY_ID=
# Ruta al private.key descargado (nunca lo subas al repo)
OP_PRIVATE_KEY_PATH=private.key
# Alternativa para deploys: el PEM completo o el PEM en base64 (tiene prioridad sobre la ruta)
# OP_PRIVATE_KEY=

# Wallets oficiales del equipo (ver docs/TEAM_WALLETS.md):
# Tendero (Caja COP):      $ilp.interledger-test.dev/tienda-billeticos
# Tendero (Ahorro COP):    $ilp.interledger-test.dev/ahorro-billeticos
# Proveedor (COP):         $ilp.interledger-test.dev/proveedor-billeticos
# Microcrédito (COP):      $ilp.interledger-test.dev/microcredito
# Cliente Local (COP):     $ilp.interledger-test.dev/cliente-one
# Cliente Extranjero(USD): $ilp.interledger-test.dev/extranjero-billeticos

# URL desde la que el navegador del usuario llega a este servidor (recibe el regreso del consentimiento)
PUBLIC_BASE_URL=http://localhost:3000
PORT=3000
# Si el frontend corre aparte (Vite, Next.js...), a dónde volver tras el consentimiento
# FRONTEND_URL=http://localhost:5173

# Hosts de wallets permitidos, separados por coma ("*" para cualquiera)
OP_ALLOWED_WALLET_HOSTS=ilp.interledger-test.dev
OP_LOG_LEVEL=warn
DATA_FILE=data/store.json

# PostgreSQL (Docker Compose)
DATABASE_URL=postgresql://miplante:miplante@localhost:5432/miplante?schema=public
```

**#19 · 16 oct, 15:14**

```text
si aplica los arreglos de docker en commits atómicos
```

**#20 · 16 oct, 15:21**

```text
levanta el docker tu y acomoda todo
```

**#21 · 16 oct, 15:33** · _Enviado dos veces; esta es la segunda. La llave privada se tachó._

```text
# Wallet address de la APP (donde generaste las developer keys). Acepta $ o https://
OP_CLIENT_WALLET_ADDRESS=https://ilp.interledger-test.dev/tienda-billeticos

# Key ID oficial registrado en https://ilp.interledger-test.dev/tienda-billeticos/jwks.json (Nickname: key-tienda)
OP_KEY_ID=2f689fad-7a6d-4e42-a94a-bd15d82e78c3

# Llave pública y privada (Ed25519) de tienda-billeticos
OP_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEARaAQ1uaLQ4iiuC5vTyjl0d8CdLNUOzu2G/hyzQt3Vuo=\n-----END PUBLIC KEY-----"
OP_PRIVATE_KEY="[REDACTADO: llave privada Ed25519]"
OP_PRIVATE_KEY_PATH=private.key

# Wallets oficiales del equipo (ver docs/TEAM_WALLETS.md):
OP_MERCHANT_WALLET_ADDRESS=https://ilp.interledger-test.dev/tienda-billeticos
OP_SAVINGS_WALLET_ADDRESS=https://ilp.interledger-test.dev/ahorro-billeticos
OP_SUPPLIER_WALLET_ADDRESS=https://ilp.interledger-test.dev/proveedor-billeticos
OP_MICROCREDIT_WALLET_ADDRESS=https://ilp.interledger-test.dev/microcredito
OP_CUSTOMER_COP_WALLET_ADDRESS=https://ilp.interledger-test.dev/cliente-one
OP_CUSTOMER_USD_WALLET_ADDRESS=https://ilp.interledger-test.dev/extranjero-billeticos

# URL desde la que el navegador del usuario llega a este servidor (recibe el regreso del consentimiento)
PUBLIC_BASE_URL=http://localhost:3000
PORT=3000
# Si el frontend corre aparte (Next.js en :3001), a dónde volver tras el consentimiento
FRONTEND_URL=http://localhost:3001

# Hosts de wallets permitidos, separados por coma ("*" para cualquiera)
OP_ALLOWED_WALLET_HOSTS=ilp.interledger-test.dev
OP_LOG_LEVEL=warn
DATA_FILE=data/store.json

# PostgreSQL (Docker Compose)
POSTGRES_USER=miplante
POSTGRES_PASSWORD=miplante
POSTGRES_DB=miplante
DATABASE_URL=postgresql://miplante:miplante@localhost:5432/miplante?schema=public


 ya guarde private.key revisalo
```

**#22 · 16 oct, 15:34**

```text
a donde le doy en ese link
```

**#23 · 16 oct, 15:35** · _Captura de la billetera de prueba con el error de acceso al aprobar._

```text
[Image #5]
[imagen adjunta]
```

**#24 · 16 oct, 15:39**

```text
como viste el publico objetivo son personas no expertas la interfaz y los campos a llenar deben ser gradables e intuitivos
```

**#25 · 16 oct, 16:11**

```text
ya autoricé, ahora hagamos una venta de prueba
```

**#26 · 16 oct, 16:25**

```text
haz pull
```

**#27 · 16 oct, 16:50**

```text
que necesitamos para desplegar yo tengo unos tokens de ruby podemos desplegar ahi? o en vercel
```

**#28 · 16 oct, 16:51**

```text
si hablo de railway
```

**#29 · 16 oct, 17:00** · _Captura del panel de DNS de Namecheap._

```text
tengo un dominio en namecheap como renombro para que quede con ese dominio [Image #6]
[imagen adjunta]
```

**#30 · 16 oct, 17:03** · _Captura de los registros DNS que pedía Railway._

```text
[Image #7] cual es la tercera que falta
[imagen adjunta]
```

**#31 · 16 oct, 17:04**

```text
ya cambié el redirect, revisa si ya funciona
```

**#32 · 16 oct, 17:06**

```text
en frontend ya actualizaron nueva parte mira lo nuevo y lo desplegamos
```

**#33 · 16 oct, 17:08** · _Respuesta a una pregunta de opciones de Claude._

```text
(respuesta a una pregunta de opciones) "La landing de Isabella (Angular) y el frontend de la app (Next.js de Brayan) usan la misma carpeta frontend/ y no se pueden mezclar tal cual. Además la landing es solo de presentación: su botón 'Prueba la caja' es una simulación y no lleva a la app real. ¿Cómo la desplegamos?"="Landing + app separadas (Recomendado)".
```

**#34 · 16 oct, 17:16**

```text
dirigelo ya para probarlo con el sistema que creamos
```

**#35 · 16 oct, 17:21** · _Captura de los registros DNS actualizados._

```text
[Image #8]
[imagen adjunta]
```

**#36 · 16 oct, 17:23**

```text
ya cambié el www, revisa si funciona
```

**#37 · 16 oct, 17:30**

```text
haz pull de dev y despliega
```

**#38 · 16 oct, 17:43**

```text
sí, elimina el servicio landing y deja app como alias y arregla los urls para que tenga onboard/ sin .html
```

**#39 · 16 oct, 20:10**

```text
haz pull y mira que han estado haciendo
```

**#40 · 16 oct, 20:35**

```text
despliega
```

**#41 · 16 oct, 21:37**

```text
vuelve a mirar dev haz pull
```

**#42 · 16 oct, 22:05**

```text
vamos a ir pasando de dev a prod revisa que todo quede funcionando a la perfeccion como lo de register ningun bug puede pasar a prod
```

**#43 · 16 oct, 22:45**

```text
el team es Juan Manuel Canchala, Brayan Zuluaga, Juan Jose Cuartas, Juan Esteban Saez, Isabell Pacheco y mira los nuevos commitis lo pasamos tambien
```

**#44 · 16 oct, 23:07**

```text
vuelve a revisar dev si subieron algo mas
```

**#45 · 17 oct, 00:53**

```text
revisa que nuevo han subido
```

**#46 · 17 oct, 05:44**

```text
haz pull mira lo que han subido y los organizamos
```

**#47 · 17 oct, 05:48** · _Respuesta a preguntas de opciones de Claude._

```text
(respuesta a una pregunta de opciones) "¿Qué organizamos en el repo? (todo va en commits atómicos a dev)"="Borrar ramas ya integradas, Sacar las skills de agentes del repo, Promover a qa y prod", "¿Dónde queda producción para la demo?"="Coolify", "GlorIA (el asistente) necesita DEEPSEEK_API_KEY en producción; sin ella queda apagada. ¿Qué hacemos?"="Brayan me pasa la key".
```

**#48 · 17 oct, 06:05** · _El token se tachó._

```text
[REDACTADO: token de la API de Coolify] este es el token de coolify
```

**#49 · 17 oct, 06:05** · _La URL del panel de administración se tachó._

```text
[REDACTADO: URL del panel de Coolify]
```

**#50 · 17 oct, 07:10**

```text
haz pull
```

**#51 · 17 oct, 07:38**

```text
pull de nuevo
```

**#52 · 17 oct, 08:33**

```text
haz pull
```

**#53 · 17 oct, 08:45**

```text
sí, prepara main con prompts y AI_USAGE, ya tienes los mios y el zip que cargue es el de brayan ya te paso el del resto los mios hazles un improve para que se vean mas de seniors y resltamos lo mas importantes no todos para que no estorbe en el ai usage terminamos usando opus 5.5 y gemini 4 argon
```

**#54 · 17 oct, 08:47**

```text
isabella pacheco

[Pegó el registro de prompts de Isabella; se publica en isabella-pacheco.md]
```

</details>
