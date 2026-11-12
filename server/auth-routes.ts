import type { Database } from "better-sqlite3";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifyPassword } from "./accounts.js";
import type { Account } from "./accounts.js";
import type { CardRouteContext } from "./card-routes.js";
import { createSession, deleteSession } from "./sessions.js";

export const SESSION_COOKIE = "session";

export interface AuthRouteContext {
  db: Database;
  cookieSecure: boolean;
  now: () => number;
  currentAccount: (request: FastifyRequest) => Account | null;
  requireRole: CardRouteContext["requireRole"];
}

// Signing in and out, and who the signed-in station is.
export function registerAuthRoutes(app: FastifyInstance, context: AuthRouteContext): void {
  const { db, cookieSecure, now, currentAccount, requireRole } = context;

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
}
