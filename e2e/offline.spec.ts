import type { Page } from "@playwright/test";
import {
  addCard,
  addPartnerFamily,
  callBack,
  expect,
  fillCarts,
  openShift,
  partnerPanel,
  partnerRow,
  queueCard,
  test,
  totalsRow,
} from "./fixtures.js";

// Waits until the service worker controls the page, so that a reload works offline.
async function waitForOfflineReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      });
    }
  });
}

test("a card entered during an outage waits on the device, then reaches distribution once", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 5, method: "East" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();

  await frontDesk.context().setOffline(true);
  await expect(frontDesk.getByText("Connection lost")).toBeVisible();

  await addCard(frontDesk, { familySize: 2, method: "Walk" });
  await expect(frontDesk.locator(".pending-card .ticket")).toHaveText("2");
  await expect(frontDesk.locator(".pending-card")).toContainText("waiting to send");
  await expect(frontDesk.getByText("1 entry waiting to send")).toBeVisible();

  // The next suggested number accounts for the waiting card.
  await expect(frontDesk.getByLabel("Card #")).toHaveAttribute("placeholder", "3");

  await frontDesk.context().setOffline(false);
  await expect(frontDesk.getByRole("heading", { name: "Cards (2)" })).toBeVisible({
    timeout: 15000,
  });
  await expect(frontDesk.getByText("waiting to send")).toHaveCount(0);

  await callBack(frontDesk);
  await expect(distribution.getByRole("heading", { name: "Queue (1)" })).toBeVisible();
  await expect(queueCard(distribution, 2)).toContainText("Family of 2");
});

test("a card waiting to send cannot be called forward yet", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);

  await frontDesk.context().setOffline(true);
  await addCard(frontDesk, { familySize: 2, method: "Walk" });
  await expect(frontDesk.locator(".pending-card")).toBeVisible();
  await expect(frontDesk.getByRole("button", { name: "Call back" })).toHaveCount(0);
});

test("several changes to one card during an outage all arrive", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  // A Family of 8 has two carts and no extras check.
  await addCard(frontDesk, { familySize: 8, method: "East" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await callBack(frontDesk);
  await expect(distribution.getByRole("heading", { name: "Queue (1)" })).toBeVisible();

  await distribution.context().setOffline(true);
  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card.locator(".status")).toHaveText("Confirmed");
  await fillCarts(card, ["12.5", "8"]);
  await card.getByRole("button", { name: "Mark distributed" }).click();
  await expect(distribution.getByRole("heading", { name: "Distributed (1)" })).toBeVisible();
  await expect(distribution.getByText("2 entries waiting to send")).toBeVisible();
  await expect(distribution.getByText("20.5 lb")).toBeVisible();

  // Nothing has reached the front desk yet.
  await expect(frontDesk.locator(".status")).toHaveText("Called back");

  await distribution.context().setOffline(false);
  await expect(frontDesk.locator(".status")).toHaveText("Distributed", { timeout: 15000 });
  await expect(distribution.getByText("waiting to send")).toHaveCount(0);
  await expect(distribution.locator(".error")).toHaveCount(0);

  await frontDesk.getByRole("button", { name: "Totals" }).click();
  await expect(totalsRow(frontDesk, "Total weight")).toContainText("20.5 lb");
});

test("returned items and partner Families entered during an outage are sent later", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();

  await distribution.context().setOffline(true);
  const returned = distribution.locator("section", { hasText: "Returned items" });
  await returned.getByLabel("Weight (lb)").fill("3.5");
  await returned.getByRole("button", { name: "Add returned weight" }).click();
  await expect(returned.getByText("3.5 lb · waiting to send")).toBeVisible();

  await addPartnerFamily(distribution, {
    partner: "Door Dash",
    number: 1,
    familySize: 4,
    carts: ["40"],
  });
  const partners = partnerPanel(distribution);
  await expect(partnerRow(distribution, 1)).toContainText("Door Dash");
  await expect(partnerRow(distribution, 1)).toContainText("waiting to send");

  await distribution.context().setOffline(false);
  await expect(returned.getByRole("button", { name: "Remove" })).toBeVisible({ timeout: 15000 });
  await expect(partners).not.toContainText("waiting to send", { timeout: 15000 });
  await expect(partnerRow(distribution, 1)).toContainText("40 lb");

  await frontDesk.getByRole("button", { name: "Totals" }).click();
  await expect(totalsRow(frontDesk, "Total return weight")).toContainText("3.5 lb");
  await expect(totalsRow(frontDesk, "Total weight")).toContainText("40 lb");
});

test("the app reloads during an outage and keeps what is waiting", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await waitForOfflineReady(frontDesk);

  await frontDesk.context().setOffline(true);
  await addCard(frontDesk, { familySize: 2, method: "Walk" });
  await expect(frontDesk.locator(".pending-card")).toBeVisible();

  await frontDesk.reload();

  await expect(frontDesk.getByRole("heading", { name: "New card" })).toBeVisible();
  await expect(frontDesk.locator(".pending-card .ticket")).toHaveText("1");
  await expect(frontDesk.getByLabel("Username")).toHaveCount(0);

  await frontDesk.context().setOffline(false);
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible({
    timeout: 15000,
  });
  await expect(frontDesk.getByText("waiting to send")).toHaveCount(0);
});

test("a reload during an outage explains when no shift has been saved on the device", async ({
  signIn,
}) => {
  const distribution = await signIn("distribution");
  await expect(distribution.getByRole("button", { name: "Open today's shift" })).toBeVisible();
  await waitForOfflineReady(distribution);

  await distribution.context().setOffline(true);
  await distribution.reload();

  await expect(distribution.locator(".notice")).toHaveText(
    "Today's shift can't be loaded until the connection returns.",
  );

  await distribution.context().setOffline(false);
  await expect(distribution.getByRole("button", { name: "Open today's shift" })).toBeVisible({
    timeout: 15000,
  });
});

test("an entry refused after reconnecting is reported with its details", async ({ signIn }) => {
  const first = await signIn("front-desk");
  const second = await signIn("front-desk");
  await openShift(first);
  await expect(second.getByRole("heading", { name: "New card" })).toBeVisible();

  await first.context().setOffline(true);
  await addCard(first, { familySize: 2, method: "Walk", number: 7 });
  await expect(first.locator(".pending-card")).toBeVisible();

  await addCard(second, { familySize: 4, method: "Bus", number: 7 });
  await expect(second.getByRole("heading", { name: "Cards (1)" })).toBeVisible();

  await first.context().setOffline(false);
  const rejected = first.locator(".rejected");
  await expect(rejected).toContainText("Card 7", { timeout: 15000 });
  await expect(rejected).toContainText("family of 2", { ignoreCase: true });
  await expect(rejected).toContainText("That card number is already in use");

  await rejected.getByRole("button", { name: "Dismiss" }).click();
  await expect(rejected).toHaveCount(0);
});

test("a station whose live connection silently stopped still catches up", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const muted = await signIn("distribution", { muteLive: true, installClock: true });
  await expect(muted.getByRole("button", { name: "Sign out" })).toBeVisible();
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "East" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await callBack(frontDesk);

  await muted.clock.fastForward("00:01:00");

  await expect(muted.getByRole("heading", { name: "Queue (1)" })).toBeVisible();
});

test("actions needing the server explain themselves during an outage", async ({ signIn }) => {
  const distribution = await signIn("distribution");
  await expect(distribution.getByRole("button", { name: "Open today's shift" })).toBeVisible();

  await distribution.context().setOffline(true);
  await distribution.getByRole("button", { name: "Open today's shift" }).click();
  await expect(distribution.locator(".error")).toContainText("needs a connection");

  await distribution.getByRole("button", { name: "Sign out" }).click();
  await expect(distribution.locator(".error")).toContainText("needs a connection");
  await expect(distribution.getByLabel("Username")).toHaveCount(0);
});

test("the app can be installed", async ({ signIn, serverUrl }) => {
  const frontDesk = await signIn("front-desk");
  await expect(frontDesk.getByRole("button", { name: "Sign out" })).toBeVisible();

  const manifestHref = await frontDesk.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (
    await frontDesk.request.get(new URL(manifestHref ?? "", serverUrl).href)
  ).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  expect(manifest.name).toBeTruthy();

  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const response = await frontDesk.request.get(new URL(icon.src, serverUrl).href);
    expect(response.ok()).toBe(true);
    expect(icon.type).toBe("image/png");
    expect(response.headers()["content-type"]).toContain("image/png");
  }

  await waitForOfflineReady(frontDesk);
  await expect(frontDesk.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
