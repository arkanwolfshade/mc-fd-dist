import type { Database } from "better-sqlite3";

export interface AuditEntry {
  id: number;
  at: number;
  actor: string;
  action: string;
  detail: string;
}

export const AUTOMATIC_ACTOR = "automatic";

// The actor is a station or admin username. Shared logins cannot identify a person,
// as ADR 0007 records. Never pass passwords in the detail.
export function recordAudit(
  db: Database,
  entry: { at: number; actor: string; action: string; detail?: object },
): void {
  db.prepare("INSERT INTO audit_log (at, actor, action, detail) VALUES (?, ?, ?, ?)").run(
    entry.at,
    entry.actor,
    entry.action,
    JSON.stringify(entry.detail ?? {}),
  );
}

export function listAudit(db: Database, limit: number): AuditEntry[] {
  return db
    .prepare("SELECT id, at, actor, action, detail FROM audit_log ORDER BY id DESC LIMIT ?")
    .all(limit) as AuditEntry[];
}
