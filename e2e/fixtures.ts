import { resolve } from "node:path";
import { test as base, expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import type { AddressInfo } from "node:net";
import { createAccount } from "../server/accounts.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";

export const PASSWORD = "local-test-password-1";

interface Fixtures {
  serverUrl: string;
  signIn: (
    username: string,
    options?: { password?: string; muteLive?: boolean; installClock?: boolean },
  ) => Promise<Page>;
  pageErrors: string[];
}

export const test = base.extend<Fixtures>({
  // Own server and database per test, because each date allows only one shift.
  serverUrl: async ({}, use) => {
    const db = openDatabase(":memory:");
    await createAccount(db, { username: "front-desk", password: PASSWORD, role: "front_desk" });
    await createAccount(db, { username: "distribution", password: PASSWORD, role: "distribution" });
    await createAccount(db, { username: "pat", password: PASSWORD, role: "admin" });
    const app = await buildApp({
      db,
      cookieSecure: false,
      clientDir: resolve("dist/client"),
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    await use(`http://127.0.0.1:${port}/`);
    await app.close();
    db.close();
  },

  pageErrors: async ({}, use) => {
    const errors: string[] = [];
    await use(errors);
    expect(errors, "uncaught errors in the page").toEqual([]);
  },

  // Each station gets its own browser context, as separate devices have separate cookies.
  signIn: async ({ browser, serverUrl, pageErrors }, use) => {
    const contexts: Awaited<ReturnType<Browser["newContext"]>>[] = [];
    await use(async (username, options = {}) => {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      page.on("pageerror", (error) => pageErrors.push(error.message));
      if (options.muteLive) {
        await page.routeWebSocket("**/api/live", (socket) => {
          socket.connectToServer().onMessage(() => {});
        });
      }
      // Must happen before the page loads, to control the timers the page sets up.
      if (options.installClock) {
        await page.clock.install();
      }
      await page.goto(serverUrl);
      await page.getByLabel("Username").fill(username);
      await page.getByLabel("Password").fill(options.password ?? PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      return page;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect };

export async function openShift(frontDesk: Page): Promise<void> {
  await frontDesk.getByRole("button", { name: "Open today's shift" }).click();
  await expect(frontDesk.getByRole("heading", { name: "New card" })).toBeVisible();
}

export async function addCard(
  frontDesk: Page,
  card: { familySize: number; method: string; seniorBox?: boolean; number?: number },
): Promise<void> {
  if (card.number !== undefined) {
    await frontDesk.getByLabel("Card #").fill(String(card.number));
  }
  await frontDesk.getByLabel("# in family").fill(String(card.familySize));
  await frontDesk.getByRole("button", { name: card.method, exact: true }).click();
  if (card.seniorBox) {
    await frontDesk.getByRole("button", { name: "Senior box" }).click();
  }
  await frontDesk.getByRole("button", { name: "Save card" }).click();
}

export async function callForward(frontDesk: Page): Promise<void> {
  await frontDesk.getByRole("button", { name: "Call forward" }).first().click();
}

export function queueCard(distribution: Page, number: number) {
  return distribution.locator(".queue-card").filter({ hasText: `#${number} ` });
}

export function totalsRow(page: Page, label: string) {
  return page
    .locator(".totals tr")
    .filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
}
