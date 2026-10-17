import { OpenPaymentsClientError } from "@interledger/open-payments";

/** Expired or invalid access token: rotating the token can fix it. */
export function isAuthError(error: unknown): boolean {
  return error instanceof OpenPaymentsClientError && error.status === 401;
}

/**
 * The server refused a non-interactive grant token: expired (401) or no longer active (403,
 * "Inactive Token"). Requesting a new grant fixes it, unlike for an interactive grant.
 */
export function isTokenRejected(error: unknown): boolean {
  return (
    error instanceof OpenPaymentsClientError &&
    (error.status === 401 || error.status === 403)
  );
}

/** Human-readable message for any error, using the Open Payments description when there is one. */
export function describeError(error: unknown): string {
  if (error instanceof OpenPaymentsClientError) {
    return error.description || error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
