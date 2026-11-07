// Creates an account: npm run account -- <username> <front_desk|distribution|admin>
// The password is read from standard input, so it does not end up in shell history.
import { createInterface } from "node:readline/promises";
import { createAccount, ROLES } from "../accounts.js";
import type { Role } from "../accounts.js";
import { loadConfig } from "../config.js";
import { openDatabase } from "../db.js";

const [username, role] = process.argv.slice(2);

if (!username || !ROLES.includes(role as Role)) {
  console.error(`Usage: npm run account -- <username> <${ROLES.join("|")}>`);
  process.exit(1);
}

const prompt = createInterface({ input: process.stdin, output: process.stderr });
const password = await prompt.question("Password: ");
prompt.close();

const db = openDatabase(loadConfig().databasePath);
try {
  await createAccount(db, { username, password, role: role as Role });
  console.log(`Created ${role} account: ${username}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  db.close();
}
