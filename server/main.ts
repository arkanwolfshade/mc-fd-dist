import { existsSync } from "node:fs";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
const app = await buildApp({
  db,
  cookieSecure: config.cookieSecure,
  trustProxy: config.trustProxy,
  logger: true,
  ...(existsSync(config.clientDir) ? { clientDir: config.clientDir } : {}),
});

async function shutdown(): Promise<void> {
  await app.close();
  db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: config.host });
