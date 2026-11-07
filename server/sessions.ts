import { createHash, randomBytes } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { Account, Role } from "./accounts.js";

const HOUR = 60 * 60 * 1000;

// Station devices stay signed in. Admin accounts can see reports and change
// settings, so their sessions are short. See ADR 0007.
const SESSION_LIFETIME: Record<Role, number> = {
  front_desk: 90 * 24 * HOUR,
  distribution: 90 * 24 * HOUR,
  admin: 12 * HOUR,
};

// Only a hash is stored, so a copy of the database or a backup cannot be used to
// take over a live session.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(
  db: Database,
  account: Account,
  now: number,
): { token: string; lifetimeMs: number } {
  const token = randomBytes(32).toString("base64url");
  const lifetimeMs = SESSION_LIFETIME[account.role];
  db.prepare("INSERT INTO session (token_hash, account_id, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    account.id,
    now + lifetimeMs,
  );
  return { token, lifetimeMs };
}

export function findSessionAccount(db: Database, token: string, now: number): Account | null {
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT account.id, account.username, account.role, session.expires_at
       FROM session JOIN account ON account.id = session.account_id
       WHERE session.token_hash = ?`,
    )
    .get(tokenHash) as (Account & { expires_at: number }) | undefined;

  if (!row) {
    return null;
  }
  if (row.expires_at <= now) {
    deleteSession(db, token);
    return null;
  }
  return { id: row.id, username: row.username, role: row.role };
}

export function deleteSession(db: Database, token: string): void {
  db.prepare("DELETE FROM session WHERE token_hash = ?").run(hashToken(token));
}
