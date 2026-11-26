import type { Page } from "@playwright/test";
import { expect, openShift, test } from "./fixtures.js";

// Each ? button opens a short piece of the guides in the browser's own popover (ADR 0038).
// The screen sizes come from the projects (playwright.config.ts, ADR 0031).

async function checkPopout(page: Page, title: string, words: string): Promise<void> {
  const button = page.getByRole("button", { name: `Help: ${title}`, exact: true });
  const card = page.getByRole("dialog", { name: title });
  const close = card.getByRole("button", { name: "Close", exact: true });
  await expect(card).toBeHidden();

  // By keyboard: focus goes into the card, and comes back to the ? button when it closes.
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(card).toContainText(words);
  await expect(close).toBeFocused();

  // The whole card is on the screen, however small.
  const box = await card.boundingBox();
  const screen = page.viewportSize();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((screen?.width ?? 0) + 0.5);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((screen?.height ?? 0) + 0.5);

  await page.keyboard.press("Enter");
  await expect(card).toBeHidden();
  await expect(button).toBeFocused();

  // By tapping, and closing with Escape.
  await button.click();
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
}

test("the front desk's help popouts open and close, and keep what was typed", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await frontDesk.getByLabel("# in Family").fill("4");

  await checkPopout(frontDesk, "Card numbers", "type the number on the Family's card");
  await checkPopout(frontDesk, "Who gave the details", "from the intake computers");
  await checkPopout(frontDesk, "Boxes for seniors", "comes only with a Senior Box");

  await expect(frontDesk.getByLabel("# in Family")).toHaveValue("4");
});

test("distribution's help popouts open and close, and keep what was typed", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();
  const weight = distribution.getByLabel("Weight (lb)", { exact: true });
  await weight.fill("5");

  await checkPopout(distribution, "Serving a Family", "Enter the weight of each cart");
  await checkPopout(distribution, "Finishing the shift", "A shift left open closes by itself");

  await expect(weight).toHaveValue("5");
});
