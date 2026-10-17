# Juan Manuel Canchala · prompts

Integración de Open Payments, arquitectura y documentación del repositorio, despliegue (Docker, Railway, Coolify) y control de calidad de lo que pasa a producción.

- **Herramienta:** Claude Code (Anthropic) con **Claude Opus 5.5**, en una sola sesión del 16 al 17 de octubre de 2026, con subagentes para investigación y revisión de código.
- **Texto exacto** de cada prompt, con su ortografía original. Solo se omite el comando de la herramienta `/compact`, y los secretos se reemplazan por `[REDACTADO: …]`.
- Horas de Medellín (UTC−5).

## Lo más importante

### 1. Investigación antes de idear

```text
revisa ganadores de las anteriores hackathones de interledger revisa los tracks que hay para esta hackathon tambien mira ganadores de otras hacakthones similares y dame ideas para que hacer en la hackathon
```

- **Contexto:** Claude Code leyó las guías oficiales y lanzó tres subagentes con búsqueda web: ganadores de ediciones anteriores de Interledger, los patrocinadores de esta edición y hackatones fintech parecidas.
- **Resultado:** Un panorama de qué premian los jurados y una lista de ideas alineadas con los cuatro premios. El equipo eligió MiPlante en su tablero.

### 2. Open Payments primero, sin esperar la idea

```text
mientras elegimos la mejor idea agreguemos toda la logica para usar lo obligatorio que es openpayments
```

- **Contexto:** La integración era obligatoria y la idea aún no estaba decidida.
- **Resultado:** La capa `backend/src/openPayments/` completa antes de la idea: incoming payments, quotes, grants interactivos con verificación del hash GNAP, rotación de tokens y mandatos con tope por intervalo. Quedó registrado en el ADR 0002.

### 3. Arquitectura documentada y un historial que cuenta el porqué

```text
si, vamos con MiPlante arma todo el readme en ingles y todo lo necesario para que en los commits se vea como una secuencia logica de pensamiento y thinking de creacion de la idea mira que arquitectura vamos a usar todo el ADR vamos a hacer todo el lineamiento correcto con los archivos tipicos el system_design.md y todo eso dejemoslo bien ordenadito
```

- **Contexto:** MiPlante elegida; el repositorio debía explicar el proyecto por sí mismo.
- **Resultado:** README en inglés, `docs/SYSTEM_DESIGN.md`, `docs/API.md` y los ADR 0001–0008. Con el prompt siguiente, el primer commit grande se partió en 11 commits atómicos con Conventional Commits.

### 4. Una interfaz para tenderos, no para expertos

```text
como viste el publico objetivo son personas no expertas la interfaz y los campos a llenar deben ser gradables e intuitivos
```

- **Contexto:** La primera versión pedía datos técnicos, como direcciones de billetera completas.
- **Resultado:** Registro guiado en pasos, nombres de billetera en vez de URLs, porcentajes con deslizadores y errores en español sencillo.

### 5. Ningún bug pasa a producción

```text
vamos a ir pasando de dev a prod revisa que todo quede funcionando a la perfeccion como lo de register ningun bug puede pasar a prod
```

- **Contexto:** En pocas horas habían llegado una treintena de commits del equipo: cuentas, cuotas mensuales y pagos a acreedores.
- **Resultado:** Dos revisiones independientes con subagentes y cada hallazgo reproducido con una prueba que fallaba antes de corregirlo. Salieron 16 correcciones, entre ellas una ruta pública que dejaba usar el grant de la tienda a cualquiera con el link de una venta, pagos dobles a un acreedor, cuotas pagadas dos veces y un 500 en el registro con doble toque.

### 6. Organizar lo que llega antes de publicarlo

```text
haz pull mira lo que han subido y los organizamos
```

- **Contexto:** Llegaron 59 commits del equipo con la migración completa a Angular.
- **Resultado:** Se sacaron 22.000 líneas de skills de agentes de terceros, se corrigió la documentación de arquitectura, se borraron las ramas integradas y se recorrió cada pantalla a 390 y 1440 px antes de promover.

## Registro completo

### 1. Arranque e investigación

Repositorio, ramas y la investigación de ganadores, tracks y patrocinadores que dio las ideas.

**16 oct, 10:41**

```text
tenemos alguna carpeta de la hackthon de interledger cierto?
```

**16 oct, 10:43**

```text
crea el repo interledger_hackathon vacio por ahora
```

**16 oct, 10:43**

```text
en mi github personal
```

**16 oct, 10:52**

```text
revisa ganadores de las anteriores hackathones de interledger revisa los tracks que hay para esta hackathon tambien mira ganadores de otras hacakthones similares y dame ideas para que hacer en la hackathon
```

**16 oct, 11:14**

```text
ve creando estas ramas en el repo prod, qa, dev y haz un readme vacio
```

**16 oct, 11:15**

```text
agrega el AI_USAGE.md y la carpeta /prompts a main
```

**16 oct, 11:18**

```text
quita la version 00 esto lo hacemos al final mantenlo en el gitignore y antes de que termine lo subimos
```

**16 oct, 11:21**

```text
ahora si hagamos brainstorming dame en un parrafo varias ideas de que podemos hacer
```

**16 oct, 11:23**

```text
dame varias ideas
```

### 2. Open Payments primero y arquitectura

La integración obligatoria antes de elegir la idea, y el repositorio contado como una secuencia de decisiones.

**16 oct, 11:26**

```text
mientras elegimos la mejor idea agreguemos toda la logica para usar lo obligatorio que es openpayments
```

**16 oct, 11:45**

```text
si súbelo a dev
```

**16 oct, 11:45** · _Adjuntó una foto del tablero de ideas del equipo._

```text
[Image #1] cual de estas ideas ves interesante
```

**16 oct, 12:06**

```text
si, vamos con MiPlante arma todo el readme en ingles y todo lo necesario para que en los commits se vea como una secuencia logica de pensamiento y thinking de creacion de la idea mira que arquitectura vamos a usar todo el ADR vamos a hacer todo el lineamiento correcto con los archivos tipicos el system_design.md y todo eso dejemoslo bien ordenadito
```

**16 oct, 12:31** · _Enviado mientras Claude trabajaba._

```text
recuerda subir todo en commits atomicos y dejando todo esos commits de nivel profesional
```

**16 oct, 12:52**

```text
si si parte el primer commit en los commits atomicos
```

### 3. Integración con el equipo y primera venta real

Docker, llaves del test wallet, una interfaz para no expertos y la primera venta de punta a punta.

**16 oct, 13:28**

```text
haz pull del repo
```

**16 oct, 13:36**

```text
en dev brayan dejo la rama dev revisa el docker y lo que necesitamos para levantar
```

**16 oct, 15:12**

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

**16 oct, 15:14**

```text
si aplica los arreglos de docker en commits atómicos
```

**16 oct, 15:21**

```text
levanta el docker tu y acomoda todo
```

**16 oct, 15:33** · _Enviado dos veces; esta es la segunda, con la línea final. La llave privada se tachó._

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

**16 oct, 15:34**

```text
a donde le doy en ese link
```

**16 oct, 15:35** · _Captura de la billetera de prueba mostrando el error de acceso al aprobar._

```text
[Image #5]
[imagen adjunta]
```

**16 oct, 15:39**

```text
como viste el publico objetivo son personas no expertas la interfaz y los campos a llenar deben ser gradables e intuitivos
```

**16 oct, 16:11**

```text
ya autoricé, ahora hagamos una venta de prueba
```

**16 oct, 16:25**

```text
haz pull
```

### 4. Despliegue y dominio

Railway, miplante.online en Namecheap, la landing de Isabella con la app real y URLs limpias.

**16 oct, 16:50**

```text
que necesitamos para desplegar yo tengo unos tokens de ruby podemos desplegar ahi? o en vercel
```

**16 oct, 16:51**

```text
si hablo de railway
```

**16 oct, 17:00** · _Captura del panel de DNS de Namecheap._

```text
tengo un dominio en namecheap como renombro para que quede con ese dominio [Image #6]
[imagen adjunta]
```

**16 oct, 17:03** · _Captura de los registros DNS que pedía Railway._

```text
[Image #7] cual es la tercera que falta
[imagen adjunta]
```

**16 oct, 17:04**

```text
ya cambié el redirect, revisa si ya funciona
```

**16 oct, 17:06**

```text
en frontend ya actualizaron nueva parte mira lo nuevo y lo desplegamos
```

**16 oct, 17:08** · _Respuesta a una pregunta de opciones que hizo Claude._

```text
(respuesta a una pregunta de opciones) "La landing de Isabella (Angular) y el frontend de la app (Next.js de Brayan) usan la misma carpeta frontend/ y no se pueden mezclar tal cual. Además la landing es solo de presentación: su botón 'Prueba la caja' es una simulación y no lleva a la app real. ¿Cómo la desplegamos?"="Landing + app separadas (Recomendado)".
```

**16 oct, 17:16**

```text
dirigelo ya para probarlo con el sistema que creamos
```

**16 oct, 17:21** · _Captura de los registros DNS actualizados._

```text
[Image #8]
[imagen adjunta]
```

**16 oct, 17:23**

```text
ya cambié el www, revisa si funciona
```

**16 oct, 17:30**

```text
haz pull de dev y despliega
```

**16 oct, 17:43**

```text
sí, elimina el servicio landing y deja app como alias y arregla los urls para que tenga onboard/ sin .html
```

### 5. Calidad antes de producción

Cada cambio del equipo revisado, probado y promovido dev → qa → prod.

**16 oct, 20:10**

```text
haz pull y mira que han estado haciendo
```

**16 oct, 20:35**

```text
despliega
```

**16 oct, 21:37**

```text
vuelve a mirar dev haz pull
```

**16 oct, 22:05**

```text
vamos a ir pasando de dev a prod revisa que todo quede funcionando a la perfeccion como lo de register ningun bug puede pasar a prod
```

**16 oct, 22:45**

```text
el team es Juan Manuel Canchala, Brayan Zuluaga, Juan Jose Cuartas, Juan Esteban Saez, Isabell Pacheco y mira los nuevos commitis lo pasamos tambien
```

**16 oct, 23:07**

```text
vuelve a revisar dev si subieron algo mas
```

**17 oct, 00:53**

```text
revisa que nuevo han subido
```

### 6. Organización, Coolify y entrega

Limpieza del repositorio, producción en Coolify y esta entrega.

**17 oct, 05:44**

```text
haz pull mira lo que han subido y los organizamos
```

**17 oct, 05:48** · _Respuesta a las preguntas de opciones que hizo Claude._

```text
(respuesta a una pregunta de opciones) "¿Qué organizamos en el repo? (todo va en commits atómicos a dev)"="Borrar ramas ya integradas, Sacar las skills de agentes del repo, Promover a qa y prod", "¿Dónde queda producción para la demo?"="Coolify", "GlorIA (el asistente) necesita DEEPSEEK_API_KEY en producción; sin ella queda apagada. ¿Qué hacemos?"="Brayan me pasa la key".
```

**17 oct, 06:05** · _El token se tachó._

```text
[REDACTADO: token de la API de Coolify] este es el token de coolify
```

**17 oct, 06:05** · _La URL se tachó: es el panel de administración del servidor._

```text
[REDACTADO: URL del panel de Coolify]
```

**17 oct, 07:10**

```text
haz pull
```

**17 oct, 07:38**

```text
pull de nuevo
```

**17 oct, 08:33**

```text
haz pull
```

**17 oct, 08:45**

```text
sí, prepara main con prompts y AI_USAGE, ya tienes los mios y el zip que cargue es el de brayan ya te paso el del resto los mios hazles un improve para que se vean mas de seniors y resltamos lo mas importantes no todos para que no estorbe en el ai usage terminamos usando opus 5.5 y gemini 4 argon
```

**17 oct, 08:47**

```text
isabella pacheco

[Pegó el registro de prompts de Isabella; se publica tal cual en isabella-pacheco.md]
```
