import { OpenPaymentsClientError } from "@interledger/open-payments";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { describeError } from "../../openPayments/errors.js";
import { AppError } from "../../shared/errors.js";

/** Any /api path no controller answered. */
export function apiNotFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Ruta no encontrada" });
}

/**
 * Turns what a controller threw into the API's error shape (docs/API.md): invalid input is 400,
 * the app's own errors carry their status, a wallet that refused is 502, the rest is 500.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: "Datos inválidos",
      details: error.issues.map(
        (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`,
      ),
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof OpenPaymentsClientError) {
    res.status(502).json({
      error: "Open Payments rechazó la solicitud",
      details: describeError(error),
      upstreamStatus: error.status,
    });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "JSON inválido" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Error interno" });
}
