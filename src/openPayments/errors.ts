import { OpenPaymentsClientError } from "@interledger/open-payments";

/** Error with an HTTP status that is safe to show to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

/** Expired or invalid access token: rotating the token can fix it. */
export function isAuthError(error: unknown): boolean {
  return error instanceof OpenPaymentsClientError && error.status === 401;
}

export function describeError(error: unknown): string {
  if (error instanceof OpenPaymentsClientError) {
    return error.description || error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
