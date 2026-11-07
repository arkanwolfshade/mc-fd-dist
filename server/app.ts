import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { Database } from "better-sqlite3";
import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { listAccounts, verifyPassword } from "./accounts.js";
import type { Account, Role } from "./accounts.js";
import { registerCardRoutes } from "./card-routes.js";
import { createSession, deleteSession, findSessionAccount } from "./sessions.js";

const SESSION_COOKIE = "session";

export interface AppOptions {
  db: Database;
  cookieSecure: boolean;
  trustProxy?: boolean;
  logger?: boolean;
  now?: () => number;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { db, cookieSecure, now = Date.now } = options;
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(websocket);

  function currentAccount(request: FastifyRequest): Account | null {
    const token = request.cookies[SESSION_COOKIE];
    return token ? findSessionAccount(db, token, now()) : null;
  }

  function requireRole(...roles: Role[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const account = currentAccount(request);
      if (!account) {
        return reply.code(401).send({ error: "Not signed in" });
      }
      if (roles.length > 0 && !roles.includes(account.role)) {
        return reply.code(403).send({ error: "Not allowed" });
      }
    };
  }

  app.post<{ Body: { username: string; password: string } }>(
    "/api/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string", minLength: 1, maxLength: 100 },
            password: { type: "string", minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const account = await verifyPassword(db, request.body.username, request.body.password);
      if (!account) {
        return reply.code(401).send({ error: "Incorrect username or password" });
      }

      const session = createSession(db, account, now());
      reply.setCookie(SESSION_COOKIE, session.token, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: "strict",
        path: "/",
        maxAge: Math.floor(session.lifetimeMs / 1000),
      });
      return { username: account.username, role: account.role };
    },
  );

  app.post("/api/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      deleteSession(db, token);
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/me", { preHandler: requireRole() }, async (request) => {
    const account = currentAccount(request) as Account;
    return { username: account.username, role: account.role };
  });

  app.get("/api/admin/accounts", { preHandler: requireRole("admin") }, async () => {
    return listAccounts(db);
  });

  // Stations only listen on this socket. All writes go through the HTTP routes, so
  // that validation and role checks live in one place.
  app.get("/api/live", { websocket: true, preValidation: requireRole() }, () => {});

  registerCardRoutes(app, {
    db,
    currentAccount,
    requireRole,
    broadcast: (message) => {
      const data = JSON.stringify(message);
      for (const client of app.websocketServer.clients) {
        if (client.readyState === client.OPEN) {
          client.send(data);
        }
      }
    },
  });

  return app;
}
