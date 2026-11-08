import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";

async function openHelp(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Help", exact: true }).click();
}

async function expectPicturesLoaded(page: Page): Promise<void> {
  const images = page.locator(".guide img");
  await expect(images.first()).toBeVisible();
  const widths = await images.evaluateAll((elements) =>
    elements.map((image) => (image as HTMLImageElement).naturalWidth),
  );
  expect(widths.every((width) => width > 0)).toBe(true);
}

test("each station's Help tab opens its own guide, with pictures", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openHelp(frontDesk);
  await expect(
    frontDesk.getByRole("heading", { level: 1, name: "Front desk guide" }),
  ).toBeVisible();
  await expectPicturesLoaded(frontDesk);

  const distribution = await signIn("distribution");
  await openHelp(distribution);
  await expect(
    distribution.getByRole("heading", { level: 1, name: "Distribution guide" }),
  ).toBeVisible();
  await expectPicturesLoaded(distribution);
});

test("a station can switch to the getting started guide", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openHelp(frontDesk);
  await frontDesk.getByRole("button", { name: "Getting started" }).click();
  await expect(frontDesk.getByRole("heading", { level: 1, name: "Getting started" })).toBeVisible();
  await expect(frontDesk.getByRole("button", { name: "Admin guide" })).toHaveCount(0);
});

test("an admin can read every guide", async ({ signIn }) => {
  const admin = await signIn("pat");
  await openHelp(admin);
  for (const name of ["Front desk guide", "Distribution guide", "Admin guide", "Getting started"]) {
    await admin.getByRole("button", { name }).click();
    await expect(admin.getByRole("heading", { level: 1, name })).toBeVisible();
  }
});

test("guides show none of the markup meant for AI readers", async ({ signIn }) => {
  const admin = await signIn("pat");
  await openHelp(admin);
  for (const name of ["Front desk guide", "Distribution guide", "Admin guide", "Getting started"]) {
    await admin.getByRole("button", { name }).click();
    const guide = admin.locator(".guide");
    await expect(guide).toBeVisible();
    for (const marker of ["[SPEC]", "[NOTE]", "[BUG]", "[?]", "AI READING INSTRUCTION"]) {
      await expect(guide).not.toContainText(marker);
    }
  }
});

test("help works during an outage", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await expect(frontDesk.getByRole("button", { name: "Sign out" })).toBeVisible();
  await frontDesk.context().setOffline(true);
  await openHelp(frontDesk);
  await expect(
    frontDesk.getByRole("heading", { level: 1, name: "Front desk guide" }),
  ).toBeVisible();
});
