import type { FastifyInstance } from "fastify";
import { expect } from "vitest";

export const PASSWORD = "correct-horse-battery";

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
