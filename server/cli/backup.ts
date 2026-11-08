// Backs up, checks or restores the database named by DATABASE_PATH:
//   backup create <file>    write a verified backup of the live database
//   backup check <file>     verify a backup and show what it holds
//   backup restore <file>   replace the database with a backup (stop the server first)
// Each prints what the backup holds as JSON, so that a restore can be compared with it.
import { createBackup, describeBackup, restoreBackup } from "../backup.js";
import { loadConfig } from "../config.js";

const [command, file] = process.argv.slice(2);

try {
  if (!file || !["create", "check", "restore"].includes(command as string)) {
    throw new Error("Usage: backup <create|check|restore> <file>");
  }
  const { databasePath } = loadConfig();
  if (command === "create") {
    await createBackup(databasePath, file);
  } else if (command === "restore") {
    const kept = restoreBackup(file, databasePath);
    console.error(kept ? `Previous database kept at ${kept}` : "No previous database to keep");
  }
  console.log(JSON.stringify(describeBackup(command === "restore" ? databasePath : file)));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
