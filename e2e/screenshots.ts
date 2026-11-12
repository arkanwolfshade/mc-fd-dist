// Takes the screenshots used in the volunteer guides, from the real server and client with
// made-up data and a fixed date, so that they can be taken again whenever the screens change.
//
//   npm run docs:screenshots
//
// Pictures are written to docs/guides/images/ at tablet size.
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import type { Browser, Locator, Page } from "@playwright/test";
import { createAccount } from "../server/accounts.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";

const OUTPUT = resolve("docs/guides/images");
const VIEWPORT = { width: 1280, height: 800 };
const SHIFT_TIME = new Date(2026, 10, 7, 9, 30);

async function station(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`page error: ${error.message}`));
  await page.clock.install({ time: SHIFT_TIME });
  await page.goto(url);
  return page;
}

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

// Cards are found by the number on their ticket.
function ticket(page: Page, number: number) {
  return page.locator(".ticket").filter({ hasText: new RegExp(`^${number}$`) });
}

async function shot(target: Page | Locator, name: string): Promise<void> {
  await target.screenshot({ path: `${OUTPUT}/${name}.png`, animations: "disabled" });
  console.log(`wrote ${name}.png`);
}

async function addCard(
  page: Page,
  card: {
    size: string;
    method: string;
    initials: string;
    seniorBox?: boolean;
    cheese?: boolean;
    other?: string;
  },
): Promise<void> {
  await page.getByLabel("# in Family").fill(card.size);
  await page.getByRole("button", { name: card.method, exact: true }).click();
  if (card.seniorBox) await page.getByRole("button", { name: "Senior Box" }).click();
  if (card.cheese) await page.getByRole("button", { name: "Cheese" }).click();
  if (card.other) await page.getByLabel("Other").fill(card.other);
  await chooseInitials(page, card.initials);
  await page.getByRole("button", { name: "Save card" }).click();
}

// Taps the quick button for initials already used this shift, or types new ones.
async function chooseInitials(page: Page, initials: string): Promise<void> {
  const quick = page
    .getByRole("group", { name: "Info from" })
    .getByRole("button", { name: initials, exact: true });
  if ((await quick.count()) > 0) {
    await quick.click();
  } else {
    await page.getByLabel("New initials").fill(initials);
  }
}

async function run(browser: Browser, url: string, password: string): Promise<void> {
  const fd = await station(browser, url);
  // The page checks the session before showing the form.
  await expect(fd.getByLabel("Username")).toBeVisible();
  await shot(fd, "sign-in");
  await signIn(fd, "front-desk", password);
  await shot(fd, "open-shift");
  await fd.getByRole("button", { name: "Open today's shift" }).click();

  const dist = await station(browser, url);
  await signIn(dist, "distribution", password);
  await expect(dist.getByRole("heading", { name: "Queue (0)" })).toBeVisible();

  // Front desk.
  const fdCards = fd.locator("section.panel", { hasText: "Cards (" });
  await addCard(fd, {
    size: "5",
    method: "East",
    initials: "AB",
    seniorBox: true,
    cheese: true,
    other: "Needs help carrying to the car",
  });
  await addCard(fd, { size: "9", method: "Walk", initials: "CD", seniorBox: true });
  await expect(fdCards.getByRole("heading", { name: "Cards (2)" })).toBeVisible();
  // The third card shows the quick buttons for initials already used this shift.
  await fd.getByLabel("# in Family").fill("2");
  await fd.getByRole("button", { name: "Bus", exact: true }).click();
  await chooseInitials(fd, "AB");
  await shot(fd.locator("form.panel"), "front-desk-new-card");
  await fd.getByRole("button", { name: "Save card" }).click();
  await expect(fdCards.getByRole("heading", { name: "Cards (3)" })).toBeVisible();
  await shot(fd, "front-desk");
  await fdCards
    .locator("li")
    .filter({ has: ticket(fd, 1) })
    .getByRole("button", { name: "Call back" })
    .click();
  await fdCards
    .locator("li")
    .filter({ has: ticket(fd, 2) })
    .getByRole("button", { name: "Call back" })
    .click();
  await shot(fdCards, "front-desk-cards");

  // Distribution.
  const queue = (number: number) =>
    dist.locator(".queue-card").filter({ has: ticket(dist, number) });
  await expect(dist.getByRole("heading", { name: "Queue (2)" })).toBeVisible();
  await shot(dist, "distribution");
  await queue(2).getByRole("button", { name: "Correct details" }).click();
  await queue(2).locator(".correct").getByLabel("# in Family").fill("8");
  await shot(queue(2), "distribution-correct");
  await queue(2).getByRole("button", { name: "Save correction" }).click();
  // A Family of 5 has two carts and the extras check.
  await queue(1).getByRole("button", { name: "Confirm card 1" }).click();
  await queue(1).getByLabel("Cart 1 (lb)").fill("12.5");
  await queue(1).getByLabel("Cart 2 (lb)").fill("8");
  await queue(1).getByLabel("Extras added").check();
  await queue(1).getByLabel("What was added").fill("Bakery");
  await shot(queue(1), "distribution-weights");
  await queue(1).getByRole("button", { name: "Mark distributed" }).click();
  // Card 2, corrected to a Family of 8, has two carts and no extras check.
  await queue(2).getByRole("button", { name: "Confirm card 2" }).click();
  await queue(2).getByLabel("Cart 1 (lb)").fill("18");
  await queue(2).getByRole("button", { name: "Mark distributed" }).click();
  await expect(queue(2).locator(".confirm")).toContainText("Cart 2 has no weight.");
  await shot(queue(2).locator(".confirm"), "distribution-no-weight");
  await queue(2).getByRole("button", { name: "Go back" }).click();
  await queue(2).getByLabel("Cart 2 (lb)").fill("12");
  await queue(2).getByRole("button", { name: "Mark distributed" }).click();
  await expect(dist.getByRole("heading", { name: "Distributed (2)" })).toBeVisible();
  await shot(dist.locator("section.panel", { hasText: "Distributed (" }), "distribution-done");

  const returned = dist.locator("section", { hasText: "Returned items" });
  await returned.getByLabel("Weight (lb)").fill("3.5");
  await returned.getByRole("button", { name: "Add returned weight" }).click();
  await expect(returned.getByRole("button", { name: "Remove" })).toBeVisible();
  await shot(returned, "distribution-returned");

  // One Door Dash Family is saved, and the next is shown being entered.
  const partners = dist.locator("section", { hasText: "End of shift" });
  await partners.getByRole("button", { name: "Door Dash", exact: true }).click();
  await partners.getByLabel("Card #").fill("40");
  await partners.getByLabel("# in Family").fill("4");
  await partners.getByLabel("Cart 1 (lb)").fill("40");
  await partners.getByRole("button", { name: "Add partner Family" }).click();
  await expect(
    partners
      .locator("li")
      .filter({ has: ticket(dist, 40) })
      .filter({ hasText: "40 lb" }),
  ).toBeVisible();
  await partners.getByRole("button", { name: "Helping Hands", exact: true }).click();
  await partners.getByLabel("Card #").fill("41");
  await partners.getByLabel("# in Family").fill("6");
  await partners.getByLabel("Cart 1 (lb)").fill("15");
  await partners.getByLabel("Cart 2 (lb)").fill("10");
  await partners.getByLabel("Extras added").check();
  await shot(partners, "distribution-last-cards");
  await partners.getByRole("button", { name: "Add partner Family" }).click();
  await expect(
    dist.getByRole("heading", { name: "End of shift: Door Dash and Helping Hands (2)" }),
  ).toBeVisible();

  // Dropout.
  await fd.context().setOffline(true);
  await expect(fd.getByText("Connection lost")).toBeVisible();
  await addCard(fd, { size: "3", method: "West", initials: "CD" });
  await expect(fd.locator(".pending-card")).toBeVisible();
  await shot(fd, "front-desk-offline");
  await fd.context().setOffline(false);
  await expect(fd.getByText("waiting to send")).toHaveCount(0, { timeout: 15000 });

  // Totals and closing.
  await dist.getByRole("button", { name: "Totals", exact: true }).click();
  await shot(dist.locator(".totals").locator("xpath=ancestor::section[1]"), "totals");
  await dist.getByRole("button", { name: "Distribution", exact: true }).click();
  await dist.getByRole("button", { name: "Close shift" }).click();
  await shot(dist.locator("section.panel", { hasText: "Finish" }), "close-shift");
  await dist.getByRole("button", { name: "Yes, close the shift" }).click();
  await expect(fd.getByText("This shift is closed")).toBeVisible();
  await shot(fd, "shift-closed");

  // Admin.
  const admin = await station(browser, url);
  await signIn(admin, "pat", password);
  await admin.getByRole("button", { name: "Admin", exact: true }).click();
  const reports = admin.locator("section.panel", { hasText: "Shifts and reports" });
  await reports.getByRole("button", { name: "Show totals" }).click();
  await expect(reports.getByText("All shifts in range")).toBeVisible();
  await shot(reports, "admin-reports");
  await shot(admin.locator("section.panel", { hasText: "Accounts" }), "admin-accounts");
  await shot(admin.locator("section.panel", { hasText: "Recent activity" }), "admin-activity");
}

mkdirSync(OUTPUT, { recursive: true });
const db = openDatabase(":memory:");
// Only for this temporary database, which disappears when the script ends.
const password = randomBytes(18).toString("base64url");
await createAccount(db, { username: "front-desk", password, role: "front_desk" });
await createAccount(db, { username: "distribution", password, role: "distribution" });
await createAccount(db, { username: "pat", password, role: "admin" });
const app = await buildApp({ db, cookieSecure: false, clientDir: resolve("dist/client") });
await app.listen({ port: 0, host: "127.0.0.1" });
const { port } = app.server.address() as AddressInfo;

const browser = await chromium.launch();
let failed = false;
try {
  await run(browser, `http://127.0.0.1:${port}/`, password);
} catch (error) {
  failed = true;
  console.error(error);
  // Shows what each station looked like when the script stopped.
  for (const [index, context] of browser.contexts().entries()) {
    for (const page of context.pages()) {
      await page.screenshot({ path: `test-results/screenshots-failure-${index}.png` });
    }
  }
} finally {
  await browser.close();
  await app.close();
  db.close();
}
process.exit(failed ? 1 : 0);
