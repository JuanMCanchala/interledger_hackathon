# MiPlante — Design System (`MASTER.md`)

> **Fuente de verdad global (Master Design System)** extraída de la Landing Page de **MiPlante** (`frontend/src/styles.scss` y `frontend/src/app/features/landing/*`), estructurada bajo la metodología de las skills **`fronted-design`** (5 pasos de ejecución) y **`ui-ux-pro-max`** (jerarquía de prioridades 1→10, tokens semánticos, coreografía GSAP y arquitectura Angular 22 Standalone).

---

## 1. Identidad del Producto y Dirección Visual (`fronted-design` Paso 1)

- **Producto:** **MiPlante** — Billetera y caja digital con separación automática de bolsillos (*Plante / Hogar / Ahorro / Libre*) sobre **Open Payments (Interledger)** para tenderos, vendedores informales y comercios de barrio en Colombia y LATAM.
- **Personalidad de marca:** *Editorial Barrio & Tactile Fintech* («Echa pa' lante»). Combina la calidez tangible del papel de cuaderno, sellos, notas adhesivas y garabatos (*doodles*) hechos a mano con la precisión moderna de una interfaz financiera de alto contraste.
- **Atributos clave:**
  - **Táctil y cercano:** Textura orgánica `/paper.png` sobre superficies oscuras y claras; cuaderno rayado con margen lima; estética de tienda real, no de banco corporativo frío.
  - **Alto contraste operativo:** Verde selva profundo (`--monte`) + Verde lima eléctrico (`--lima`) + Blanco cálido de papel (`--papel`) para legibilidad inmediata en calle o mostrador.
  - **Coreografía con propósito:** Animaciones GSAP vinculadas al scroll y a la física (monedas cayendo en frascos, subrayado progresivo del manifiesto, cuaderno con historia en 3 actos) que respetan estrictamente `prefers-reduced-motion`.

---

## 2. Tokens de Color y Superficies (`fronted-design` Paso 3 · `ui-ux-pro-max` Prioridades 1 y 6)

Definidos en [`frontend/src/styles.scss`](../../frontend/src/styles.scss):

### 2.1 Paleta Principal (CSS Custom Properties)

| Token CSS | Valor | Rol Semántico | Contraste / Uso Principal |
| :--- | :--- | :--- | :--- |
| `--monte` | `#094641` | **Background Primary / Brand Ink** | Fondo base del sitio (`body`), texto sobre fondos `--lima` y `--papel`. |
| `--monte-hondo` | `#06332f` | **Background Deep / Surface Recessed** | Secciones de inmersión (`story`, `footer`, pantalla de teléfono, interior de frascos, navbar fija con `94%` de opacidad). |
| `--monte-claro` | `#135c55` | **Surface Elevated / Card** | Tarjetas Bento (`.tile`), contenedor de la caja interactiva (`.till`), pistas de barras de progreso y botón hamburguesa. |
| `--lima` | `#ccf137` | **Primary Accent / CTA / Highlight** | Botones primarios, anillos de foco (`:focus-visible`), llenado de frascos y barras, cintas *ticker*, notas adhesivas (`.sticky`), subrayados animados y cursor magnético. |
| `--papel` | `#fdfbfb` | **Foreground Light / Editorial Surface** | Color de texto principal sobre fondos verdes; fondo de secciones editoriales (`purpose`) y recibos (`.ticket`). |
| `--hoja` | `#f4f6ec` | **Notebook Paper Surface** | Papel base del cuaderno escolar en la sección `story` y recorte del sello. |
| `--tinta` | `#181818` | **Deep Ink / Hardware Frame** | Trazos manuscritos del cuaderno (`.scribble`), chasis del teléfono (`.phone`) y escena de mancha de tinta (`.ink`). |
| `--renglon` | `rgb(9 70 65 / 14%)` | **Notebook Rule Line** | Líneas horizontales del cuaderno (`repeating-linear-gradient`). |

### 2.2 Transparencias, Gradientes y Texturas

- **Textura global de papel:** `url(/paper.png)` combinada sobre `--monte`, `--monte-hondo`, `--monte-claro`, `--papel` y `--lima` para dar grano físico.
- **Resplandor Hero:** `radial-gradient(ellipse 60% 50% at 78% 62%, rgb(204 241 55 / 16%), transparent 70%)`.
- **Spotlight interactivo en Bento Tiles:** `radial-gradient(320px circle at var(--mx) var(--my), rgb(204 241 55 / 16%), transparent 70%)` actualizado por puntero.
- **Bordes sutiles en tarjetas oscuras:** `box-shadow: inset 0 0 0 1px rgb(253 251 251 / 8%)` o `0 0 0 1px rgb(204 241 55 / 25%)`.
- **Sombras de elevación profunda:** `0 40px 80px -30px rgb(0 0 0 / 70%)` para contenedores protagonistas (`.till`, `.phone`, `.notebook`).

### 2.3 Pares Accesibles verificados (`ui-ux-pro-max` WCAG AA/AAA)

| Fondo | Texto / Icono | Ratio aprox. | Nivel WCAG |
| :--- | :--- | :---: | :---: |
| `--monte` (`#094641`) | `--papel` (`#fdfbfb`) | **10.4 : 1** | AAA |
| `--monte-hondo` (`#06332f`) | `--papel` (`#fdfbfb`) | **12.8 : 1** | AAA |
| `--monte-claro` (`#135c55`) | `--papel` (`#fdfbfb`) | **7.6 : 1** | AAA |
| `--lima` (`#ccf137`) | `--monte` (`#094641`) | **7.9 : 1** | AAA |
| `--papel` (`#fdfbfb`) | `--monte` (`#094641`) | **10.4 : 1** | AAA |
| `--hoja` (`#f4f6ec`) | `--tinta` (`#181818`) | **16.2 : 1** | AAA |

---

## 3. Sistema Tipográfico (`fronted-design` Paso 3 · `ui-ux-pro-max` Prioridad 6)

### 3.1 Familias de Fuentes

- **`--sans`: `Garet, Lexend, system-ui, sans-serif`**
  - Cuerpo, titulares de impacto, botones, cifras tabulares y tarjetas Bento.
- **`--script`: `Marelle, 'Playwrite ES', cursive`**
  - Acentos manuscritos y emocionales: subtítulo del manifiesto (`.title`), saludo en el teléfono (`.greeting`) y apuntes del cuaderno contable (`.notebook`).

### 3.2 Escala Tipográfica Fluida (`clamp()`)

| Elemento / Selector | Tamaño (`font-size`) | `line-height` | Peso (`font-weight`) | Tracking / Notas |
| :--- | :--- | :---: | :---: | :--- |
| **Body base** (`body`) | `1.0625rem` (`17px`) | `1.6` | `400` | `-webkit-font-smoothing: antialiased` |
| **Section Heading** (`h2`) | `clamp(2rem, 5.2vw, 3.6rem)` | `1.05` | `700` | `letter-spacing: -0.02em; text-wrap: balance` |
| **Manifesto Statement** (`.manifesto`) | `clamp(1.7rem, 4.2vw, 3.4rem)` | `1.22` | `700` | `letter-spacing: -0.02em` |
| **Story Chapter Title** (`.chapter-title`) | `clamp(1.8rem, 3.8vw, 3.1rem)` | `1.1` | `700` | `color: var(--lima); text-wrap: balance` |
| **Hero Sentence** (`.sentence`) | `clamp(1.5rem, 3.4vw, 2.6rem)` | `1.15` | `500` | `letter-spacing: -0.01em; text-wrap: balance` |
| **Ticker Item** (`.ticker-item`) | `clamp(1.2rem, 2.4vw, 1.8rem)` | `1.0` | `700` | `white-space: nowrap` |
| **Script Subtitle** (`.purpose .title`) | `clamp(1.3rem, 2.2vw, 1.7rem)` | `1.4` | `400` | `font-family: var(--script)` |
| **Bento Tile Heading** (`.tile h3`) | `clamp(1.25rem, 2vw, 1.6rem)` | `1.2` | `700` | Subtítulo de tarjeta |
| **Card Heading** (`h3`) | `1.35rem` | `1.2` | `700` | Estándar global |
| **Lead Paragraph** (`.lead`) | `clamp(1.1rem, 1.6vw, 1.3rem)` | `1.6` | `400` | `max-width: 34em; text-wrap: pretty` |
| **Montos y Cifras** (`.ticket-amount`, `.amount`, `.day`) | `0.85rem` – `1.5rem` | `1.1` | `500–700` | **Obligatorio:** `font-variant-numeric: tabular-nums` |

---

## 4. Layout, Espaciado y Geometría (`fronted-design` Paso 2 · `ui-ux-pro-max` Prioridad 5)

### 4.1 Contenedor y Ritmo Vertical

- **Gutter fluido (`--gutter`):** `clamp(1rem, 4vw, 3rem)`
- **Ancho máximo (`--max`):** `1200px`
- **Wrapper estándar (`.wrap`):** `width: min(100% - 2 * var(--gutter), var(--max)); margin-inline: auto;`
- **Padding vertical de secciones:**
  - Hero: `min-height: 100svh; padding-block: clamp(6rem, 13vh, 8rem) 3rem;`
  - Secciones estándar (`preview`, `features`, `closing`): `padding-block: clamp(5rem, 12vw, 8rem–9rem);`
  - Sección editorial (`purpose`): `padding-block: clamp(6rem, 14vw, 11rem);`

### 4.2 Radios de Borde (`border-radius`)

- `--radius-lg`: `28px` → Tarjetas Bento (`.tile`) y caja registradora (`.till`).
- `--radius-sm`: `12px` → Ticket de venta (`.ticket`) y elementos internos.
- `999px` (Pill) → Botones (`.button`), chips de monto (`.chip`) y links de navegación.
- Radios orgánicos/especiales:
  - Frascos de ahorro (`.jar`): `10px 10px 22px 22px`
  - Cuaderno (`.notebook`): `8px 18px 18px 8px` con lomo en `box-shadow: -10px 0 0 -4px var(--monte)`
  - Teléfono (`.phone` / `.screen`): `44px` exterior / `34px` pantalla interior

### 4.3 Breakpoints Responsivos

- **`< 700px` (Mobile-first):** Grillas de 1 columna; menú circular en pantalla completa (`clip-path: circle(...)`); doodles secundarios ocultos para limpiar ruido visual.
- **`>= 700px` (Tablet):** Bento grid pasa a 2 columnas (`repeat(2, 1fr)`).
- **`>= 900px` (Desktop Split Layouts):**
  - **Hero:** `grid-template-columns: 1fr minmax(380px, 0.62fr)` con áreas `'headline till' 'aside till'`.
  - **Story:** `grid-template-columns: 0.8fr 1.2fr` (narración a la izquierda, cuaderno animado a la derecha).
  - **Preview:** `grid-template-columns: 1fr auto` (etapas a la izquierda, mockup de teléfono a la derecha).
- **`>= 1100px` (Wide Desktop):**
  - **Navbar:** Pasa de menú hamburguesa a barra horizontal de pills.
  - **Bento Grid (`features`):** 4 columnas con `grid-template-areas`:
    ```css
    grid-template-areas:
      'network network consent consent'
      'network network currencies change'
      'elastic elastic history reminders';
    ```

---

## 5. Catálogo de Componentes y Activos de Marca (`fronted-design` Pasos 3 y 4)

### 5.1 Botones y Acciones (`.button`, `.button-ghost`, `.chip`)
- **Tamaño táctil mínimo (`ui-ux-pro-max` Prioridad 2):**
  - `.button`: `min-height: 48px; padding: 0.75rem 1.4rem; border-radius: 999px; font: 700 1rem/1 var(--sans)`.
  - `.cta`, `.chip`, `.toggle`: `min-height: 44px` (cumple mínimo 44×44px).
- **Variantes cromáticas:**
  - **Primario sobre oscuro:** Fondo `--lima`, texto `--monte`.
  - **Ghost sobre oscuro:** Transparente, texto `--lima`, borde interior `inset 0 0 0 2px var(--lima)`.
  - **Inverso sobre fondo `--lima` (sección `.closing`):** Primario usa fondo `--monte` y texto `--lima`; Ghost usa borde y texto `--monte`.
- **Micro-interacción:**
  - `:hover`: `transform: translateY(-2px)`
  - `:active`: `transform: translateY(1px) scale(0.98)` (en `.chip`: `scale(0.95)`)
  - `[aria-pressed="true"]` en `.chip`: Relleno `--lima` y texto `--monte`.

### 5.2 Activos de Marca (`shared/brand`)
- **`<app-logo>` ([`logo.ts`](../../frontend/src/app/shared/brand/logo.ts)):**
  - SVG vectorial parametrizable con variables CSS `--logo-ink` (default `--papel`), `--logo-accent` (default `--lima`) y `--logo-cut` (default `--monte`, cambia a `--monte-hondo` en navbar scrolled o `--hoja` en sellos).
  - Soporta el juego tipográfico (`wordplay` / `settled`) que transforma **«MiPlante»** en **«Pa' lante»**.
- **`<app-doodle>` ([`doodle.ts`](../../frontend/src/app/shared/brand/doodle.ts)):**
  - Ilustraciones con máscara CSS (`mask: var(--doodle) center / contain no-repeat; background: currentColor; aspect-ratio: 1`) que heredan cualquier token de color (`--lima`, `--monte`, `--papel`).
  - Catálogo de 10 íconos ilustrados: `'alcancia' | 'monedas' | 'peso' | 'pago' | 'planta' | 'duda' | 'ahorro' | 'crecimiento' | 'calculadora' | 'billetera'`.

### 5.3 Patrones Característicos de la Landing
1. **Simulador de Caja y Frascos (`.till` + `.pockets`):** Selector de montos por chips, ticket impreso y 4 frascos con nivel dinámico (`--level`) y caída animada de monedas (`.coin`).
2. **Cinta Ticker inclinada (`.ticker`):** Marquesina continua en `--lima` con rotación `-1.5deg` y estrellas separadoras.
3. **Subrayado progresivo de cifras (`.figure`):** En el manifiesto, usa `linear-gradient(var(--lima), var(--lima)) 0 100% / calc(var(--fill) * 100%) 100% no-repeat` con `box-decoration-break: clone`.
4. **Cuaderno Contable (`.notebook`):** Fondo multicapa (textura de papel + margen vertical lima + renglones repetidos), inclinado `1.5deg`, con notas adhesivas `.sticky` (`rotate: -4deg`) y sellos `.stamp` (`rotate: -8deg`).
5. **Tarjetas Bento con Iluminación Radial (`.tile`):** Elevación en hover (`translateY(-4px)` con curva elástica `cubic-bezier(0.34, 1.56, 0.64, 1)`) y seguimiento del cursor mediante `--mx` y `--my`.
6. **Cursor Magnético Personalizado (`<app-cursor>`):** Anillo de `40px` (`64px` en hover, `84px` con etiqueta `data-cursor`) + punto central de `6px`, activo únicamente cuando `(pointer: fine) and (prefers-reduced-motion: no-preference)` y con atracción magnética (`.magnetic`).

---

## 6. Coreografía, Motion yAccesibilidad (`fronted-design` Pasos 4 y 5 · `ui-ux-pro-max` Prioridades 1 y 7)

### 6.1 Arquitectura de Animación (`core/motion.ts`)
- **Plugins GSAP registrados:** `ScrollTrigger`, `ScrollSmoother`, `SplitText`, `DrawSVGPlugin`.
- **Helper declarativo `animate(setup)`:** Ejecuta configuraciones GSAP en `afterNextRender` acotadas al `ElementRef` del componente con `gsap.matchMedia(root)` y limpia automáticamente todos los triggers y timelines en `DestroyRef.onDestroy(() => mm.revert())`.
- **Media Queries de control:**
  - `MOTION = '(prefers-reduced-motion: no-preference)'`
  - `FINE_POINTER = '(pointer: fine) and (prefers-reduced-motion: no-preference)'`

### 6.2 Reglas de Accesibilidad y Degradación Elegante
- **Foco de teclado visible:** `:focus-visible { outline: 3px solid var(--lima); outline-offset: 3px; border-radius: 6px; }` (nunca se elimina sin reemplazo de alto contraste).
- **Respeto total a `prefers-reduced-motion: reduce`:**
  - En CSS global: `scroll-behavior: auto` y `transition-duration: 0.01ms !important`.
  - En componentes (`story`, `purpose`, `hero`): Si el usuario prefiere movimiento reducido, las escenas del cuaderno se apilan estáticamente sin pin de scroll y los subrayados (`--fill: 1`) se muestran completos desde el inicio.
- **Semántica y lectores de pantalla:**
  - Doodles y cursor decorativos llevan `aria-hidden="true"`.
  - Chips interactivos usan `aria-pressed`.
  - Navegación activa usa `aria-current`.
  - Textos auxiliares usan `.sr-only`.

---

## 7. Reglas de Implementación en Angular 22 (`ui-ux-pro-max` Stack `angular`)

1. **Componentes 100% Standalone + `ChangeDetectionStrategy.OnPush`:** Prohibido usar `NgModule`.
2. **Estado reactivo con Signals (`signal`, `computed`, `input`):** Evitar mutaciones imperativas de DOM fuera de `animate()`.
3. **Tokens CSS antes que valores mágicos:** Todo nuevo componente o vista debe consumir `--monte`, `--monte-hondo`, `--monte-claro`, `--lima`, `--papel`, `--hoja`, `--tinta`, `--sans`, `--script`, `--radius-lg` y `--radius-sm`.
