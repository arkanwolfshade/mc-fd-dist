import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";

// The page's background, which is the sage paper in light colors and near-black in dark.
const LIGHT = "rgb(234, 239, 234)";
const DARK = "rgb(19, 26, 22)";

function background(page: Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

async function openHelp(page: Page) {
  await page
    .getByRole("navigation", { name: "Screens" })
    .getByRole("button", { name: "Help", exact: true })
    .click();
  return page.getByRole("group", { name: "Colors on this device" });
}

test("colors follow the device until Light or Dark is chosen, and the choice is kept", async ({
  signIn,
}) => {
  const page = await signIn("front-desk");
  await page.emulateMedia({ colorScheme: "dark" });
  const colors = await openHelp(page);
  await expect(colors.getByRole("button", { name: "Same as this device" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await background(page)).toBe(DARK);

  await colors.getByRole("button", { name: "Light" }).click();
  await expect(colors.getByRole("button", { name: "Light" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await background(page)).toBe(LIGHT);

  await page.emulateMedia({ colorScheme: "light" });
  await colors.getByRole("button", { name: "Dark" }).click();
  expect(await background(page)).toBe(DARK);
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(await background(page)).toBe(DARK);

  await (await openHelp(page)).getByRole("button", { name: "Same as this device" }).click();
  expect(await background(page)).toBe(LIGHT);
});
