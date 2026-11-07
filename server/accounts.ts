import argon2 from "argon2";
import { SqliteError } from "better-sqlite3";
import type { Database } from "better-sqlite3";

export const ROLES = ["front_desk", "distribution", "admin"] as const;
export type Role = (typeof ROLES)[number];

export interface Account {
  id: number;
  username: string;
  role: Role;
}

export class AccountExistsError extends Error {
  constructor(username: string) {
    super(`Account already exists: ${username}`);
  }
}

const MIN_PASSWORD_LENGTH = 10;

// Verified against when the username is unknown, so that a login attempt takes
// about the same time whether or not the account exists.
const decoyHash = argon2.hash("decoy-password-never-matches");

export async function createAccount(
  db: Database,
  input: { username: string; password: string; role: Role },
): Promise<void> {
  if (!ROLES.includes(input.role)) {
    throw new Error(`Unknown role: ${input.role}`);
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const passwordHash = await argon2.hash(input.password);
  try {
    db.prepare("INSERT INTO account (username, password_hash, role) VALUES (?, ?, ?)").run(
      input.username,
      passwordHash,
      input.role,
    );
  } catch (error) {
    if (error instanceof SqliteError && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new AccountExistsError(input.username);
    }
    throw error;
  }
}

export function findAccountByUsername(db: Database, username: string): Account | null {
  const row = db.prepare("SELECT id, username, role FROM account WHERE username = ?").get(username);
  return (row as Account | undefined) ?? null;
}

export async function changePassword(db: Database, id: number, password: string): Promise<void> {
  const passwordHash = await argon2.hash(password);
  db.prepare("UPDATE account SET password_hash = ? WHERE id = ?").run(passwordHash, id);
}

export function deleteAccount(db: Database, id: number): void {
  db.prepare("DELETE FROM account WHERE id = ?").run(id);
}

export async function verifyPassword(
  db: Database,
  username: string,
  password: string,
): Promise<Account | null> {
  const row = db
    .prepare("SELECT id, username, role, password_hash FROM account WHERE username = ?")
    .get(username) as (Account & { password_hash: string }) | undefined;

  if (!row) {
    await argon2.verify(await decoyHash, password);
    return null;
  }
  if (!(await argon2.verify(row.password_hash, password))) {
    return null;
  }
  return { id: row.id, username: row.username, role: row.role };
}

export function listAccounts(db: Database): Pick<Account, "username" | "role">[] {
  return db.prepare("SELECT username, role FROM account ORDER BY username").all() as Pick<
    Account,
    "username" | "role"
  >[];
}
