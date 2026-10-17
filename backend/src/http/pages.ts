import { fileURLToPath } from "node:url";
import express from "express";

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));

/** Pages people open from links and QR codes; each one is public/<page>.html. */
const PAGES = [
  "login",
  "register",
  "onboard",
  "merchant",
  "pay",
  "cobro",
  "sandbox",
] as const;

/**
 * The web client: /onboard and /onboard/ serve onboard.html, and the old /onboard.html links
 * (printed QR codes, consent callbacks stored before the change) redirect permanently, keeping
 * their query string. Everything else under public/ is served as it is.
 */
export function servePages(app: express.Express): void {
  for (const page of PAGES) {
    app.get([`/${page}`, `/${page}/`], (_req, res) => {
      res.sendFile(`${page}.html`, { root: PUBLIC_DIR });
    });
    app.get(`/${page}.html`, (req, res) => {
      const query = req.originalUrl.indexOf("?");
      res.redirect(301, `/${page}${query === -1 ? "" : req.originalUrl.slice(query)}`);
    });
  }
  app.use(express.static(PUBLIC_DIR));
}
