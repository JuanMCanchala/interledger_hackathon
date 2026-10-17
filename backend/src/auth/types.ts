/** A shopkeeper's account. */
export interface UserRecord {
  id: string;
  name: string;
  /** Lowercase; one account per email. */
  email: string;
  /** "scrypt$<salt>$<hash>": the password itself is never stored. */
  passwordHash: string;
  createdAt: string;
}

/** A signed-in browser. The token is the only credential: it is sent as a Bearer token. */
export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}
