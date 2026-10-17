# Juan Esteban Saez · prompts

Instalación de MiPlante como app (PWA), desde el inicio de sesión y la caja del tendero.

- **Herramienta:** Claude Code (Anthropic) con **Claude Opus 5.5**.
- Su sesión no se conservó, así que estos prompts están **reconstruidos a partir de sus commits**
  del 17 de octubre de 2026, en versión de ingeniería.

## 1. Instalable como app, sin prometer modo offline

**Contexto:** El tendero abre MiPlante desde el celular todos los días; instalada, queda a un toque
desde la pantalla de inicio.

**Prompt de ingeniería (reconstruido)**

> Haz que MiPlante se pueda instalar como app (PWA) sin convertirla en una app offline: el inicio de
> sesión, las ventas, los pagos, los datos financieros y el consentimiento de la billetera siguen
> necesitando conexión. Captura y difiere el evento `beforeinstallprompt`: el diálogo nativo solo se
> abre cuando el tendero toca **Instalar MiPlante**, y si lo descarta no vuelve a aparecer solo. En
> iPhone y iPad, donde ese evento no existe, despliega las instrucciones de Safari (Compartir →
> Añadir a pantalla de inicio). Oculta la acción cuando la app ya corre instalada o cuando el
> navegador no permite instalarla, para no mostrar un botón que no funciona.

**Resultado:** `PwaInstallService` y el componente `install-app`, con la acción opcional y la guía
para iOS ([375101d](https://github.com/JuanMCanchala/interledger_hackathon/commit/375101d),
[0cfa3bd](https://github.com/JuanMCanchala/interledger_hackathon/commit/0cfa3bd)).

## 2. Ofrecerla donde el tendero vuelve cada día

**Contexto:** La instalación tiene sentido para quien usa la caja, no para quien visita la landing.

**Prompt de ingeniería (reconstruido)**

> Muestra la acción de instalar en el inicio de sesión y en la caja del tendero, integrada al diseño
> de cada pantalla, sin ventanas emergentes ni avisos automáticos.

**Resultado:** La acción aparece en `/login` y en la caja
([9548a45](https://github.com/JuanMCanchala/interledger_hackathon/commit/9548a45)).

## 3. Identidad estable y despliegues que llegan a los celulares

**Contexto:** Cambiar la URL de arranque de una PWA puede cambiar su identidad, y un manifiesto en
caché impide que un despliegue llegue a los teléfonos.

**Prompt de ingeniería (reconstruido)**

> Estabiliza la identidad de la PWA: `id` y `scope` en `/`, y arranque en `/login`, que ya lleva a la
> caja o al registro según la sesión. Declara los íconos como `any` y no como `maskable`, porque el
> logo no cabe completo en el círculo seguro. Haz que nginx revalide el manifiesto y los archivos del
> service worker en cada despliegue.

**Resultado:** Manifiesto con identidad estable y revalidación en nginx
([eba42d9](https://github.com/JuanMCanchala/interledger_hackathon/commit/eba42d9)).

## 4. Pruebas y documentación

**Prompt de ingeniería (reconstruido)**

> Cubre con pruebas el ciclo de instalación (evento diferido, aceptación, rechazo y modo instalado) y
> la detección de plataforma. Documenta en el README del frontend cómo se instala en cada plataforma
> y qué validar en producción.

**Resultado:** Pruebas del servicio y del componente, y la guía de instalación con su validación en
producción ([5fa2b60](https://github.com/JuanMCanchala/interledger_hackathon/commit/5fa2b60),
[97596fd](https://github.com/JuanMCanchala/interledger_hackathon/commit/97596fd)).
