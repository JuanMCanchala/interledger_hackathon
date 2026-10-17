import type { Request } from "express";

/** The session token from `Authorization: Bearer <token>`. */
export function bearerToken(req: Request): string | undefined {
  return req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
}
