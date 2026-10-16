# MiPlante frontend

Angular PWA with GSAP. For now it only has the landing page.

```bash
npm install
npm start        # http://localhost:4200
npm test
npm run build
```

## Structure

- `src/app/core`: motion setup (GSAP plugins, reduced-motion handling) and money formatting.
- `src/app/shared/brand`: logo (vector paths taken from the brand PDF) and doodles.
- `src/app/features/<feature>`: one folder per feature, holding its own domain logic and UI.
