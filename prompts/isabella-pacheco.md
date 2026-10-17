# Isabella Pacheco · prompts

Frontend: la landing en Angular con GSAP, la identidad de marca en toda la interfaz y el registro guiado de la app.

- **Herramienta:** Claude Code (Anthropic) con **Claude Opus 5.5**.
- **Texto exacto** de cada prompt, tal como lo exportó Isabella.

_MiPlante: prompts del frontend (Claude Code, Claude Opus 5.5) · Open Payments Hackathon, Ruta N, Medellín, 16 y 17 de octubre de 2026_

## 1. Landing inicial

```text
lee el briefing y haz la landing inicial solicitada (corre en local para que pueda darte
la aprobación), usa los recursos de /Recursos Front. La arquitectura que usará la
aplicación es monolito modular, produce un código altamente limpio, modular y cuyos
comentarios sean solos lo estrictamente necesarios.  no toques backend aún, deja el
frontend en su propia rama de Github.
```

## 2. Primera revisión de la landing

```text
1- Haz el scroll smooth
2- El hero lo veo muy plano, quiero algo aún más llamativo
3- Me gusta la animación "Pa lante" pero cada vez que se repite se recarga la página, haz
   que solo ocurre una vez al inicio en el hero y que sea el loader de la página
4- No me gusta la sección de cifras, luce muy genérica.
5- Dale aún más fuerza a la parte del storytelling.
6- La interfaz en general me gusta, pero le falta algo de fuerza e impacto, evita
   secciones genéricas, profundiza sobre la aplicación (aclara que trabaja sobre Open
   Payments), por ejemplo un bento grid interactivo, micro-interacciones con cursor, etc
7- La flor en la interfaz se intercala un poco con el tallo, revisa eso.
8- Puedes intentar jugar con el fondo, por ejemplo usando una textura superficial de papel
```

## 3. Navegación y recordatorios

```text
Haz la navegación con mejor UX y en la navegación hazla clara, cosas como "Doña Nelly" o
"Tu planta" No son entendibles a la primera. 
Nota: La app también tiene la funcionalidad de recordatorios.
```

## 4. Interfaz de la aplicación (login, registro, onboarding y panel)

```text
ya existe una interfaz funcional de varias pantallas (login, crear cuenta, registro, panel) pero necesito que alinees la interfaz usando la identidad de marca que hemos estado trabajando. Asegúrate de un buen UX (ej: en lugar de formularios largos que requieren scroll, hazlo multistep)
```

## 5. Alcance de las pruebas

```text
el backend funciona, haz pruebas si quieres, pero solo toca frontend
```

## 6. Espacio en pantallas grandes

```text
también siento que en pantallas relativamente grandes (16 pulgadas) se ve mucho espacio
vacío en las páginas login/registro
```
