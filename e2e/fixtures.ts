import { resolve } from "node:path";
import { test as base, expect } from "@playwright/test";
import type { Browser, Locator, Page } from "@playwright/test";
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
  card: {
    familySize: number;
    method: string;
    seniorBox?: boolean;
    cheese?: boolean;
    number?: number;
    other?: string;
    // Who gave the Family's details. Null leaves the field empty.
    initials?: string | null;
  },
): Promise<void> {
  if (card.number !== undefined) {
    await frontDesk.getByLabel("Card #").fill(String(card.number));
  }
  await frontDesk.getByLabel("# in Family").fill(String(card.familySize));
  await frontDesk.getByRole("button", { name: card.method, exact: true }).click();
  if (card.seniorBox) {
    await frontDesk.getByRole("button", { name: "Senior Box" }).click();
  }
  if (card.cheese) {
    await frontDesk.getByRole("button", { name: "Cheese" }).click();
  }
  if (card.other) {
    await frontDesk.getByLabel("Other").fill(card.other);
  }
  const initials = card.initials === undefined ? "AB" : card.initials;
  if (initials !== null) {
    await chooseInitials(frontDesk, initials);
  }
  await frontDesk.getByRole("button", { name: "Save card" }).click();
}

export function infoFrom(frontDesk: Page): Locator {
  return frontDesk.getByRole("group", { name: "Info from" });
}

// Taps the quick button for initials already used this shift, or types new ones.
export async function chooseInitials(frontDesk: Page, initials: string): Promise<void> {
  const quick = infoFrom(frontDesk).getByRole("button", { name: initials, exact: true });
  if ((await quick.count()) > 0) {
    await quick.click();
  } else {
    await frontDesk.getByLabel("New initials").fill(initials);
  }
}

export async function callBack(frontDesk: Page): Promise<void> {
  await frontDesk.getByRole("button", { name: "Call back", exact: true }).first().click();
}

// Cards are found by the number on their ticket, as a volunteer finds them.
function ticket(page: Page, number: number) {
  return page.locator(".ticket").filter({ hasText: new RegExp(`^${number}$`) });
}

export function queueCard(distribution: Page, number: number) {
  return distribution.locator(".queue-card").filter({ has: ticket(distribution, number) });
}

export function cardRow(page: Page, number: number) {
  return page.locator(".cards > li").filter({ has: ticket(page, number) });
}

// The cart inputs shown on a queue card or the partner form, one per TEFAP bag.
export function cartInputs(scope: Locator): Locator {
  return scope.getByLabel(/^Cart \d \(lb\)$/);
}

export async function fillCarts(scope: Locator, weights: (number | string)[]): Promise<void> {
  for (const [index, weight] of weights.entries()) {
    await scope.getByLabel(`Cart ${index + 1} (lb)`).fill(String(weight));
  }
}

export async function tickExtras(scope: Locator, note?: string): Promise<void> {
  await scope.getByLabel("Extras added").check();
  if (note) {
    await scope.getByLabel("What was added").fill(note);
  }
}

// Confirms a called-back card, then records its carts and extras and marks it distributed.
export async function distribute(
  distribution: Page,
  number: number,
  options: { carts: (number | string)[]; extras?: string },
): Promise<void> {
  const card = queueCard(distribution, number);
  await card.getByRole("button", { name: `Confirm card ${number}` }).click();
  await fillCarts(card, options.carts);
  if (options.extras) {
    await tickExtras(card, options.extras);
  }
  await card.getByRole("button", { name: "Mark distributed" }).click();
}

export function partnerPanel(distribution: Page): Locator {
  return distribution.locator("section", { hasText: "End of shift" });
}

export function partnerRow(distribution: Page, number: number): Locator {
  return partnerPanel(distribution)
    .locator("li")
    .filter({ has: ticket(distribution, number) });
}

// A Door Dash or Helping Hands Family, entered by distribution at the end of the shift.
export async function addPartnerFamily(
  distribution: Page,
  family: {
    partner: "Door Dash" | "Helping Hands";
    number: number;
    familySize: number;
    carts: (number | string)[];
    seniorBox?: boolean;
    cheese?: boolean;
    extras?: string;
  },
): Promise<void> {
  const panel = partnerPanel(distribution);
  await panel.getByRole("button", { name: family.partner, exact: true }).click();
  await panel.getByLabel("Card #").fill(String(family.number));
  await panel.getByLabel("# in Family").fill(String(family.familySize));
  if (family.seniorBox) {
    await panel.getByRole("button", { name: "Senior Box" }).click();
  }
  if (family.cheese) {
    await panel.getByRole("button", { name: "Cheese" }).click();
  }
  if (family.extras) {
    await tickExtras(panel, family.extras);
  }
  await fillCarts(panel, family.carts);
  await panel.getByRole("button", { name: "Add partner Family" }).click();
}

export function totalsRow(page: Page, label: string) {
  return page
    .locator(".totals tr")
    .filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
}
