import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import type { RawData } from "ws";

export const PASSWORD = "correct-horse-battery";

// A socket message can arrive as one buffer, several, or an ArrayBuffer.
export function messageText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return (Buffer.isBuffer(data) ? data : Buffer.from(data)).toString("utf8");
}

export async function signIn(app: FastifyInstance, username: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { username, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((c) => c.name === "session");
  return `session=${cookie?.value}`;
}
