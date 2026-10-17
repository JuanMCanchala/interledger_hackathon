import type { NextFunction, Request, Response } from "express";

/**
 * Lets one other origin call /api (a dev server on another port, or the frontend on its own domain)
 * and answers its preflight requests. The session travels in the Authorization header, not in a
 * cookie, so no credentials are allowed.
 */
export function cors(origin: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
