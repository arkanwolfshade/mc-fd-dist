import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import Sqlite from "better-sqlite3";
import { SCHEMA_VERSION } from "./db.js";

export interface BackupContents {
  schemaVersion: number;
  shifts: number;
  cards: number;
  latestShift: string | null;
}

const SIDE_FILES = ["-journal", "-wal", "-shm"];

function removeWithSideFiles(path: string): void {
  for (const suffix of ["", ...SIDE_FILES]) {
    rmSync(`${path}${suffix}`, { force: true });
  }
}

// Uses SQLite's backup API rather than copying the file, because a plain copy of a
// live database misses writes still held in its WAL and can catch it mid-write.
// The copy is switched out of WAL mode so that it is one self-contained file.
export async function createBackup(sourcePath: string, destinationPath: string): Promise<void> {
  const partial = `${destinationPath}.partial`;
  try {
    const source = new Sqlite(sourcePath, { readonly: true, fileMustExist: true });
    try {
      await source.backup(partial);
    } finally {
      source.close();
    }

    const copy = new Sqlite(partial);
    try {
      copy.pragma("journal_mode = DELETE");
    } finally {
      copy.close();
    }

    describeBackup(partial);
    renameSync(partial, destinationPath);
  } catch (error) {
    removeWithSideFiles(partial);
    throw error;
  }
}

// Throws unless the file is an undamaged database from this app that this version can run.
export function describeBackup(path: string): BackupContents {
  const db = new Sqlite(path, { readonly: true, fileMustExist: true });
  try {
    const check = db.pragma("integrity_check", { simple: true });
    if (check !== "ok") {
      throw new Error(`The backup failed its integrity check: ${String(check)}`);
    }

    const schemaVersion = db.pragma("user_version", { simple: true }) as number;
    if (schemaVersion === 0) {
      throw new Error("This file is not a backup of this app");
    }
    if (schemaVersion > SCHEMA_VERSION) {
      throw new Error("This backup was made by a newer version of the app");
    }

    const count = (table: string) =>
      (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
    const { latest } = db.prepare("SELECT max(date) AS latest FROM shift").get() as {
      latest: string | null;
    };
    return { schemaVersion, shifts: count("shift"), cards: count("card"), latestShift: latest };
  } finally {
    db.close();
  }
}

// The server must be stopped first. The previous database is kept beside the restored
// one, so that a restore of the wrong backup can itself be undone. Returns its path.
export function restoreBackup(backupPath: string, databasePath: string): string | null {
  describeBackup(backupPath);
  mkdirSync(dirname(databasePath), { recursive: true });

  const incoming = `${databasePath}.restoring`;
  try {
    copyFileSync(backupPath, incoming);
    describeBackup(incoming);
  } catch (error) {
    removeWithSideFiles(incoming);
    throw error;
  }

  let kept: string | null = null;
  if (existsSync(databasePath)) {
    kept = `${databasePath}.before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    renameSync(databasePath, kept);
  }
  // A leftover WAL would otherwise be replayed over the restored data.
  for (const suffix of SIDE_FILES) {
    const side = `${databasePath}${suffix}`;
    if (!existsSync(side)) continue;
    if (kept) {
      renameSync(side, `${kept}${suffix}`);
    } else {
      rmSync(side);
    }
  }

  renameSync(incoming, databasePath);
  return kept;
}
