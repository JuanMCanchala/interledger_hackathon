import { createHash, timingSafeEqual } from "node:crypto";

export interface InteractHashInput {
  /** Nonce we sent in `interact.finish.nonce` when requesting the grant. */
  clientNonce: string;
  /** Nonce the auth server returned in `interact.finish`. */
  interactNonce: string;
  /** `interact_ref` received in the finish redirect. */
  interactRef: string;
  /** Grant endpoint we called: the sender wallet address's `authServer`. */
  authServerUrl: string;
}

/**
 * GNAP interaction hash (draft-ietf-gnap-core-protocol §4.2.3), computed the way Rafiki
 * (the server behind the Interledger test wallet) does it: SHA-256, padded base64.
 */
export function computeInteractHash(input: InteractHashInput): string {
  const data = `${input.clientNonce}\n${input.interactNonce}\n${input.interactRef}\n${input.authServerUrl}`;
  return createHash("sha256").update(data).digest("base64");
}

/**
 * Checks that the finish redirect really comes from the auth server for this grant.
 * Accepts padded/unpadded base64 and the auth server URL with or without a trailing slash,
 * because implementations differ on both details.
 */
export function verifyInteractHash(
  input: InteractHashInput,
  receivedHash: string,
): boolean {
  // URL decoding can turn "+" into a space.
  const received = stripPadding(receivedHash.trim().replace(/ /g, "+"));
  const base = input.authServerUrl.replace(/\/+$/, "");
  return [base, `${base}/`].some((authServerUrl) =>
    safeEqual(
      stripPadding(computeInteractHash({ ...input, authServerUrl })),
      received,
    ),
  );
}

function stripPadding(value: string): string {
  return value.replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
