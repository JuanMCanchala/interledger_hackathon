import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "../shared/errors.js";
import type { Store } from "../storage/store.js";
import type { SessionRecord, UserRecord } from "./types.js";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  length: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export class UnauthorizedError extends AppError {
  constructor(message = "Inicia sesión para continuar") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

/**
 * Sign-up and sign-in for shopkeepers, kept simple: an email and a password, a random session
 * token sent as `Authorization: Bearer`. Passwords are stored only as a salted scrypt hash
 * (node:crypto, no dependencies), never in clear text.
 */
export class AuthService {
  private readonly now: () => Date;

  constructor(
    private readonly store: Store,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async register(input: { name: string; email: string; password: string }) {
    const email = normalizeEmail(input.email);
    if (await this.store.getUserByEmail(email)) {
      throw new AppError("Ya existe una cuenta con ese correo", 409);
    }
    const user = await this.store.saveUser({
      id: randomUUID(),
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      createdAt: this.now().toISOString(),
    });
    return this.startSession(user);
  }

  async login(input: { email: string; password: string }) {
    const user = await this.store.getUserByEmail(normalizeEmail(input.email));
    // Same message for an unknown email and a wrong password.
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedError("Correo o contraseña incorrectos");
    }
    return this.startSession(user);
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteSession(token);
  }

  /** The user behind a session token, or an UnauthorizedError. */
  async authenticate(token: string | undefined): Promise<UserRecord> {
    if (!token) throw new UnauthorizedError();
    const session = await this.store.getSession(token);
    if (!session || Date.parse(session.expiresAt) <= this.now().getTime()) {
      throw new UnauthorizedError("Tu sesión terminó; inicia sesión de nuevo");
    }
    const user = await this.store.getUser(session.userId);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  /** What the client may see about a user: never the password hash. */
  view(user: UserRecord) {
    return { id: user.id, name: user.name, email: user.email };
  }

  private async startSession(user: UserRecord) {
    const now = this.now();
    const session: SessionRecord = {
      token: randomBytes(32).toString("base64url"),
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_MS).toISOString(),
    };
    await this.store.saveSession(session);
    return { token: session.token, user: this.view(user) };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "scrypt$<salt>$<hash>", both base64url. */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}
