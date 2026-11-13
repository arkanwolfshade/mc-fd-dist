import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import type { Database } from "better-sqlite3";
import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Account, Role } from "./accounts.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { recordAudit } from "./audit.js";
import { registerAuthRoutes, SESSION_COOKIE } from "./auth-routes.js";
import { registerBatchRoutes } from "./batch-routes.js";
import { registerCardRoutes } from "./card-routes.js";
import type { LiveMessage } from "./card-routes.js";
import { findSessionAccount } from "./sessions.js";
import { scheduleAutoClose } from "./shift-closing.js";

const SESSION_ENDED_CLOSE_CODE = 4401;
const SAFE_HOST = /^[a-z0-9.-]+(:\d+)?$/i;

export interface AppOptions {
  db: Database;
  cookieSecure: boolean;
  trustProxy?: boolean;
  logger?: boolean;
  now?: () => number;
  clientDir?: string;
  autoCloseTimeZone?: string;
}

// Browsers have differed on whether 'self' covers the live socket's ws: or wss:
// address, so it is listed by host. A host that could alter the policy is left out.
function registerSecurityHeaders(app: FastifyInstance, cookieSecure: boolean): void {
  app.addHook("onRequest", async (request, reply) => {
    // nosemgrep: rules_lgpl_javascript_dos_rule-regex-dos -- SAFE_HOST is anchored and has no nested repetition, so it runs in linear time
    const socketSource = SAFE_HOST.test(request.host)
      ? ` ${cookieSecure ? "wss" : "ws"}://${request.host}`
      : "";
    reply.header(
      "content-security-policy",
      `default-src 'self'; connect-src 'self'${socketSource}; object-src 'none'; ` +
        "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    reply.header(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    // The app loads nothing from other sites, so it can isolate itself from them entirely.
    reply.header("cross-origin-opener-policy", "same-origin");
    reply.header("cross-origin-embedder-policy", "require-corp");
    reply.header("cross-origin-resource-policy", "same-origin");
    if (cookieSecure) {
      reply.header("strict-transport-security", "max-age=31536000");
    }
    // Stations can be shared devices, so shift data must not be kept in any cache.
    if (request.url.startsWith("/api/")) {
      reply.header("cache-control", "no-store");
    }
  });
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { db, cookieSecure, now = Date.now } = options;
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
  });

  registerSecurityHeaders(app, cookieSecure);

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(websocket);
  if (options.clientDir) {
    await app.register(fastifyStatic, { root: options.clientDir });
  }

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
      return undefined;
    };
  }

  registerAuthRoutes(app, { db, cookieSecure, now, currentAccount, requireRole });

  // For uptime monitoring and the container health check, so it needs no sign-in.
  app.get("/api/health", async (_request, reply) => {
    try {
      db.prepare("SELECT 1").get();
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });

  // Stations only listen on this socket. All writes go through the HTTP routes, so
  // that validation and role checks live in one place.
  const socketTokens = new WeakMap<object, string>();
  app.get("/api/live", { websocket: true, preValidation: requireRole() }, (socket, request) => {
    socketTokens.set(socket, request.cookies[SESSION_COOKIE] as string);
  });

  // A socket outlives its session unless checked, so a changed password, a sign-out
  // or an expiry must also stop live updates. See ADR 0007.
  function openSocketsWithSessions() {
    const sockets = [];
    for (const client of app.websocketServer.clients) {
      if (client.readyState !== client.OPEN) continue;
      const token = socketTokens.get(client);
      if (token && findSessionAccount(db, token, now())) {
        sockets.push(client);
      } else {
        client.close(SESSION_ENDED_CLOSE_CODE, "Session ended");
      }
    }
    return sockets;
  }

  function broadcast(message: LiveMessage): void {
    const data = JSON.stringify(message);
    for (const socket of openSocketsWithSessions()) {
      socket.send(data);
    }
  }

  const routeContext = {
    db,
    currentAccount,
    requireRole,
    broadcast,
    closeEndedSockets: () => void openSocketsWithSessions(),
    audit: (request: FastifyRequest, action: string, detail?: object) => {
      const actor = currentAccount(request)?.username ?? "unknown";
      recordAudit(db, { at: now(), actor, action, ...(detail ? { detail } : {}) });
    },
  };
  registerCardRoutes(app, routeContext);
  registerBatchRoutes(app, routeContext);
  registerAdminRoutes(app, routeContext);

  if (options.autoCloseTimeZone) {
    scheduleAutoClose(app, { db, timeZone: options.autoCloseTimeZone, now, broadcast });
  }

  return app;
}
