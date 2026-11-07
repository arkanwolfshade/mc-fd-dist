import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface Config {
  databasePath: string;
  port: number;
  host: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  clientDir: string;
  timeZone: string;
}

// Secure cookies are on unless explicitly disabled for local development over HTTP.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databasePath = env.DATABASE_PATH ?? "data/mc-fd-dist.db";
  mkdirSync(dirname(databasePath), { recursive: true });
  return {
    databasePath,
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "127.0.0.1",
    cookieSecure: env.COOKIE_SECURE !== "false",
    trustProxy: env.TRUST_PROXY === "true",
    clientDir: resolve(env.CLIENT_DIR ?? "dist/client"),
    timeZone: env.TIME_ZONE ?? "America/Phoenix",
  };
}
