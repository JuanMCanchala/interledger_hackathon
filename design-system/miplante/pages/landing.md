# Landing Page — Anatomía y Reglas de Sección (`pages/landing.md`)

> Extiende [`MASTER.md`](../MASTER.md) con el desglose específico de cada sección de la Landing Page (`frontend/src/app/features/landing/`).

---

## 1. Mapa de Secciones y Ritmo Cromo-Espacial

La landing alterna deliberadamente entre superficies verdes oscuras (`--monte`, `--monte-hondo`) y superficies claras/vibrantes (`--papel`, `--lima`) para marcar cambios de capítulo narrativo:

```
[Loader]   --monte       → Morph tipográfico «MiPlante» → «Pa' lante»
[Nav]      Fixed         → Transparente al inicio / rgb(6 51 47 / 94%) al hacer scroll + barra de progreso --lima
[Hero]     --monte       → Titular + Doodles flotantes + Simulador de Caja (.till) + Cinta Ticker (--lima, -1.5deg)
[Purpose]  --papel       → Manifiesto editorial en tinta --monte con cifras subrayadas en --lima y fuentes al pie
[Story]    --monte-hondo → Narración + Cuaderno rayado (--hoja) inclinado 1.5deg con 3 escenas en scroll-pin
[Preview]  --monte       → Etapas de crecimiento (Semilla → Árbol) + Mockup de teléfono (--tinta / --monte-hondo)
[Features] --monte       → Bento Grid de 7 tarjetas (--monte-claro y tarjeta destacada .consent en --lima)
[Closing]  --lima        → Cierre de alto impacto (botones invertidos en --monte) + Footer en --monte-hondo
```

---

## 2. Reglas por Componente de Sección

### 2.1 `<app-loader>` (`landing/loader`)
- **Superficie:** `position: fixed; inset: 0; z-index: 50; background: var(--monte)`.
- **Ancho del logo:** `min(84vw, 860px)`.
- **Comportamiento:** Bloquea el scroll del `body` con `.is-loading` mientras ejecuta la transición de entrada del logotipo y luego revela el Hero.

### 2.2 `<app-nav>` (`landing/nav`)
- **Superficie:** `position: fixed; z-index: 20`. Al hacer scroll (`.scrolled`), aplica `background: rgb(6 51 47 / 94%)` y ajusta `--logo-cut: var(--monte-hondo)`. Se oculta al bajar (`.hidden { transform: translateY(-110%) }`).
- **Indicador de lectura:** `.progress` (`height: 3px; background: var(--lima); transform-origin: left`) escalado en `X` según el progreso global de scroll.
- **Responsive (`1100px`):**
  - `< 1100px`: Botón `.toggle` circular (`44×44px`, `--monte-claro`) que abre `.menu` con `clip-path: circle(150% at calc(100% - 2.5rem) 2.5rem)`.
  - `>= 1100px`: Lista horizontal de links tipo pill (`border-radius: 999px`), con estado activo `[aria-current]` en fondo `--papel` y texto `--monte`.

### 2.3 `<app-hero>` (`landing/sections/hero`)
- **Layout (`>= 900px`):** Grid de 2 columnas `1fr minmax(380px, 0.62fr)` con áreas `'headline till' 'aside till'`.
- **Doodles flotantes (`.floaters`):** Posicionados absolutamente con `--size` en `px`, `color: var(--lima); opacity: 0.55`. En móvil (`< 900px`) se reduce su escala al `60%` y se ocultan los secundarios (`:nth-child(-n + 3), :nth-child(5)`).
- **Caja interactiva (`.till`):**
  - Contenedor en `--monte-claro` + `url(/paper.png)`, `border-radius: var(--radius-lg)`, borde `1px rgb(204 241 55 / 25%)` y `perspective: 1200px`.
  - Chips de monto (`.chip`): Pills de `44px` de alto con borde `2px solid rgb(204 241 55 / 45%)` y estado seleccionado `[aria-pressed="true"]` en `--lima`.
  - Ticket (`.ticket`): Superficie `--papel`, `border-radius: var(--radius-sm)`, monto en `1.5rem` con `tabular-nums`.
  - Bolsillos (`.pockets`): 4 columnas (`repeat(4, 1fr)`), cada una con moneda animada `.coin`, ícono `.jar-doodle` y frasco `.jar` (`border-radius: 10px 10px 22px 22px; background: var(--monte-hondo)`) cuyo relleno `.fill` crece según `--level`.

### 2.4 `<app-purpose>` (`landing/sections/purpose`)
- **Contraste editorial:** Fondo `--papel` con textura `/paper.png` y texto `--monte`.
- **Doodles de margen (`.margin-doodle`):** `opacity: 0.18`, rotados `-12deg` (izquierda) y `10deg` (derecha).
- **Subrayado de datos (`.figure`):** Fondo `linear-gradient(var(--lima), var(--lima))` controlado por la variable `--fill` (`0` a `1`) animada con ScrollTrigger.

### 2.5 `<app-story>` (`landing/sections/story`)
- **Layout (`>= 900px`):** `grid-template-columns: 0.8fr 1.2fr`. Cuando las animaciones están activas (`.animated`), fija la sección a `100svh` y alterna 3 capítulos sincronizados con la barra de pasos `.steps` (`.step` con `--done`).
- **Cuaderno (`.notebook`):**
  - Tipografía `--script`, color `--monte`, inclinación `rotate: 1.5deg`.
  - Fondo de 3 capas: textura `/paper.png` + línea de margen vertical `rgb(204 241 55 / 90%)` a `3.2em` + renglones `repeating-linear-gradient` cada `--line: 2.15em`.
  - Elementos gráficos: trazos SVG `.scribble` (`stroke: var(--tinta); stroke-width: 3`), notas `.sticky` en `--lima` (`rotate: -4deg` / `5deg`), escena de derrame de tinta `.ink` (`background: var(--tinta)`) y sello `.stamp` (`border: 3px solid var(--monte); rotate: -8deg`).

### 2.6 `<app-preview>` (`landing/sections/preview`)
- **Lista de etapas (`.stage`):** Borde izquierdo `3px solid rgb(253 251 251 / 18%)` y `opacity: 0.55`; la etapa activa (`.active`) sube a `opacity: 1` con `border-color: var(--lima)`.
- **Mockup móvil (`.phone`):** Ancho `min(300px, 78vw)`, marco `--tinta` (`padding: 12px; border-radius: 44px`), pantalla `--monte-hondo` (`border-radius: 34px`), ilustración SVG `<app-plant>` al `62%` de ancho y barras de progreso `.bar-track` (`height: 8px; background: var(--monte-claro)`) con `.bar-fill` en `--lima`.

### 2.7 `<app-features>` (`landing/sections/features`)
- **Bento Grid (`.bento`):** 1 col (`<700px`) → 2 cols (`700–1099px`) → 4 cols (`>=1100px`) con 7 celdas nombradas (`network`, `consent`, `currencies`, `change`, `elastic`, `history`, `reminders`).
- **Tarjetas (`.tile`):**
  - Fondo `--monte-claro`, `border-radius: var(--radius-lg)`, borde interior `1px rgb(253 251 251 / 8%)`.
  - Pseudo-elemento `::before` con `radial-gradient(320px circle at var(--mx) var(--my), rgb(204 241 55 / 16%), transparent 70%)`.
  - Variante destacada `.consent`: Fondo `--lima` con textura `/paper.png` y texto `--monte`.

### 2.8 `<app-closing>` (`landing/sections/closing`)
- **CTA Band (`.closing`):** Fondo `--lima`, texto `--monte`, centrado, con doodle superior (`clamp(120px, 18vw, 180px)`) y botones con paleta invertida (`.button` en `--monte` / `--lima`).
- **Footer (`.footer`):** Fondo `--monte-hondo` con `/paper.png`, texto `--papel` (`0.9rem`), logo de `150px` y enlace `.again` para volver arriba.
