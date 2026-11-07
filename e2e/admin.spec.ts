import { readFileSync } from "node:fs";
import { addCard, callForward, expect, openShift, PASSWORD, queueCard, test } from "./fixtures.js";

const NEW_PASSWORD = "a-brand-new-password";

test("distribution closes the shift, and every station sees it lock", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "East" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();

  await distribution.getByRole("button", { name: "Close shift" }).click();
  await distribution.getByRole("button", { name: "Yes, close the shift" }).click();

  for (const station of [frontDesk, distribution]) {
    await expect(station.getByText("This shift is closed")).toBeVisible();
    await expect(station.getByRole("heading", { name: "Shift totals" })).toBeVisible();
  }
  await expect(frontDesk.getByRole("heading", { name: "New card" })).toHaveCount(0);
});

test("closing can be cancelled", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "East" });
  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();

  await distribution.getByRole("button", { name: "Close shift" }).click();
  await distribution.getByRole("button", { name: "Keep it open" }).click();
  await expect(distribution.getByText("This shift is closed")).toHaveCount(0);
});

test("the front desk has no way to close a shift", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await expect(frontDesk.getByRole("button", { name: "Close shift" })).toHaveCount(0);
});

test("an admin reopens a closed shift, and stations can work again", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  const admin = await signIn("pat");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "East" });
  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();
  await distribution.getByRole("button", { name: "Close shift" }).click();
  await distribution.getByRole("button", { name: "Yes, close the shift" }).click();
  await expect(frontDesk.getByText("This shift is closed")).toBeVisible();

  await admin.getByRole("button", { name: "Admin", exact: true }).click();
  await admin.getByRole("button", { name: "Show totals" }).click();
  await admin.getByRole("button", { name: "Reopen" }).click();

  await expect(frontDesk.getByRole("heading", { name: "New card" })).toBeVisible();
  await expect(frontDesk.getByText("This shift is closed")).toHaveCount(0);
});

test("stations have no Admin tab", async ({ signIn }) => {
  const distribution = await signIn("distribution");
  await expect(distribution.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(distribution.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0);
});

test("an admin sees date-range totals and downloads CSV reports", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  const admin = await signIn("pat");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 5, method: "East" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await callForward(frontDesk);
  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Confirm" }).click();
  await card.getByLabel("Load 1 (lb)").fill("12");
  await card.getByRole("button", { name: "Mark distributed" }).click();
  await expect(distribution.getByRole("heading", { name: "Distributed (1)" })).toBeVisible();

  await admin.getByRole("button", { name: "Admin", exact: true }).click();
  await admin.getByRole("button", { name: "Show totals" }).click();
  const combined = admin.locator(".report-combined");
  await expect(combined).toContainText("1 family");
  await expect(combined).toContainText("12 lb");

  const [shiftsDownload] = await Promise.all([
    admin.waitForEvent("download"),
    admin.getByRole("link", { name: "Download shift totals (CSV)" }).click(),
  ]);
  expect(shiftsDownload.suggestedFilename()).toMatch(/^shifts-.*\.csv$/);
  const shiftsCsv = readFileSync(await shiftsDownload.path(), "utf8");
  expect(shiftsCsv.split("\r\n")[0]).toContain("families_total");
  expect(shiftsCsv.split("\r\n")).toHaveLength(3);

  const [cardsDownload] = await Promise.all([
    admin.waitForEvent("download"),
    admin.getByRole("link", { name: "Download cards (CSV)" }).click(),
  ]);
  const cardsCsv = readFileSync(await cardsDownload.path(), "utf8");
  expect(cardsCsv).toContain("distributed");
});

test("changing a station password signs that station out", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const admin = await signIn("pat");
  await expect(frontDesk.getByRole("button", { name: "Sign out" })).toBeVisible();

  await admin.getByRole("button", { name: "Admin", exact: true }).click();
  const row = admin.locator(".account").filter({ hasText: "front-desk" });
  await row.getByRole("button", { name: "Change password" }).click();
  await row.getByLabel("New password").fill(NEW_PASSWORD);
  await row.getByRole("button", { name: "Save password" }).click();
  await expect(admin.getByText("Password changed for front-desk")).toBeVisible();

  // Any activity reveals the ended session, and the station returns to sign-in.
  await admin.getByRole("button", { name: "Front desk" }).click();
  await openShift(admin);
  await expect(frontDesk.getByLabel("Username")).toBeVisible({ timeout: 15000 });

  await frontDesk.getByLabel("Username").fill("front-desk");
  await frontDesk.getByLabel("Password").fill(PASSWORD);
  await frontDesk.getByRole("button", { name: "Sign in" }).click();
  await expect(frontDesk.locator(".error")).toHaveText("Incorrect username or password");

  await frontDesk.getByLabel("Password").fill(NEW_PASSWORD);
  await frontDesk.getByRole("button", { name: "Sign in" }).click();
  await expect(frontDesk.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("an admin adds and removes another admin", async ({ signIn }) => {
  const admin = await signIn("pat");
  await admin.getByRole("button", { name: "Admin", exact: true }).click();

  const form = admin.locator("form", { hasText: "Add admin" });
  await form.getByLabel("Username").fill("sam");
  await form.getByLabel("Password").fill(NEW_PASSWORD);
  await form.getByRole("button", { name: "Add admin" }).click();

  const row = admin.locator(".account").filter({ hasText: "sam" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Remove" }).click();
  await row.getByRole("button", { name: "Yes, remove" }).click();
  await expect(row).toHaveCount(0);

  // An admin cannot remove their own account, and station logins have no Remove button.
  await expect(
    admin.locator(".account").filter({ hasText: "pat" }).getByRole("button", { name: "Remove" }),
  ).toHaveCount(0);
  await expect(
    admin
      .locator(".account")
      .filter({ hasText: "front-desk" })
      .getByRole("button", { name: "Remove" }),
  ).toHaveCount(0);
});

test("recent activity shows which station made each change", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const admin = await signIn("pat");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "East" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();

  await admin.getByRole("button", { name: "Admin", exact: true }).click();
  const activity = admin.locator(".activity");
  await expect(activity).toContainText("card.create");
  await expect(activity).toContainText("front-desk");
});
