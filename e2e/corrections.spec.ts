import type { Page } from "@playwright/test";
import { addCard, callForward, expect, openShift, queueCard, test, totalsRow } from "./fixtures.js";

function frontDeskCard(page: Page, number: number) {
  return page.locator(".cards > li").filter({ hasText: `#${number} ` });
}

test("distribution records a family who left without food, and can undo it", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 5, method: "East" });
  await callForward(frontDesk);

  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Left without food" }).click();
  await card.getByRole("button", { name: "Yes, left without food" }).click();

  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();
  await expect(frontDeskCard(frontDesk, 1).locator(".status")).toHaveText("left without food");

  await distribution.getByRole("button", { name: "Totals", exact: true }).click();
  await expect(totalsRow(distribution, "Total # of families")).toContainText("0");
  await expect(totalsRow(distribution, "Left without food")).toContainText("1");
  await expect(totalsRow(distribution, "Total # of TEFAP bags")).toContainText("0");

  await distribution.getByRole("button", { name: "Distribution", exact: true }).click();
  await distribution
    .locator(".cards > li", { hasText: "left without food" })
    .getByRole("button", { name: "Undo" })
    .click();
  // The card goes back to the front desk, which calls the family forward again.
  await expect(frontDeskCard(frontDesk, 1).locator(".status")).toHaveText("entered");
  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();
  await callForward(frontDesk);
  await expect(distribution.getByRole("heading", { name: "Queue (1)" })).toBeVisible();
});

test("a family who left can be recorded from the closing warning", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 2, method: "Walk" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();

  await distribution.getByRole("button", { name: "Close shift" }).click();
  const confirm = distribution.locator(".confirm");
  await confirm.getByRole("button", { name: "Left without food" }).click();
  await confirm.getByRole("button", { name: "Yes, left without food" }).click();

  await expect(confirm).not.toContainText("not been marked distributed");
  await expect(confirm.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("an admin deletes a card entered by mistake, and every station loses it", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const admin = await signIn("pat");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "Bus" });
  await addCard(frontDesk, { familySize: 4, method: "West" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (2)" })).toBeVisible();

  // Only admins can delete.
  await expect(frontDesk.getByRole("button", { name: "Delete" })).toHaveCount(0);

  const row = frontDeskCard(admin, 2);
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toContainText("Delete card #2? This cannot be undone.");
  await row.getByRole("button", { name: "Yes, delete" }).click();

  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await expect(frontDeskCard(frontDesk, 2)).toHaveCount(0);
  await expect(admin.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
});

test("an admin can delete from the closing warning", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const admin = await signIn("pat");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "Bus" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();

  await admin.getByRole("button", { name: "Distribution", exact: true }).click();
  await admin.getByRole("button", { name: "Close shift" }).click();
  const confirm = admin.locator(".confirm");
  await confirm.getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Yes, delete" }).click();

  await expect(confirm).not.toContainText("not been marked distributed");
  await expect(frontDesk.getByRole("heading", { name: "Cards (0)" })).toBeVisible();
});
