import type { Page } from "@playwright/test";
import { addCard, callBack, expect, openShift, queueCard, test } from "./fixtures.js";

// The size comes from the project, so this file runs once on each phone, tablet and desktop
// profile (playwright.config.ts). See ADR 0031.

// A control that spills out of its panel can end up underneath the next panel, where
// it cannot be tapped. Fonts differ between devices, so this checks every screen width.
async function controlsOutsidePanels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const viewportWidth = document.documentElement.clientWidth;
    for (const panel of document.querySelectorAll(".panel")) {
      const panelBox = panel.getBoundingClientRect();
      for (const control of panel.querySelectorAll("button, input, a, select")) {
        const box = control.getBoundingClientRect();
        if (box.right > panelBox.right + 0.5 || box.left < panelBox.left - 0.5) {
          problems.push(
            `${control.textContent || control.outerHTML.slice(0, 60)} leaves its panel`,
          );
        }
        if (box.right > viewportWidth + 0.5) {
          problems.push(
            `${control.textContent || control.outerHTML.slice(0, 60)} leaves the screen`,
          );
        }
      }
    }
    return problems;
  });
}

// The page should never need a sideways scroll to reach something.
async function scrollsSideways(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const { scrollWidth, clientWidth } = document.documentElement;
    return scrollWidth > clientWidth
      ? [`the page is ${scrollWidth}px wide on a ${clientWidth}px screen`]
      : [];
  });
}

const TAP_TARGET = 44;
const TEXT_INPUT = 16;

// Fingers need room: every control a volunteer taps is at least 44 px each way. A checkbox or
// radio button is tapped through its label, so the label is what is measured.
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate((minimum) => {
    // What a person would call it: its label, its text, or its placeholder.
    const nameOf = (element: HTMLElement): string =>
      element.getAttribute("aria-label") ||
      (element as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
      element.textContent?.trim() ||
      element.getAttribute("placeholder") ||
      element.id ||
      "unnamed";
    const problems: string[] = [];
    const selector = "button, a[href], select, input:not([type=hidden])";
    for (const control of document.querySelectorAll<HTMLElement>(selector)) {
      const isChoice =
        control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type);
      const target = (isChoice && control.closest("label")) || control;
      const box = target.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.width < minimum - 0.5 || box.height < minimum - 0.5) {
        const name = nameOf(control);
        problems.push(
          `${control.tagName.toLowerCase()} "${name}" is ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
      }
    }
    return problems;
  }, TAP_TARGET);
}

// iOS Safari zooms the whole page in when a field with text under 16 px is tapped.
async function smallTextFields(page: Page): Promise<string[]> {
  return page.evaluate((minimum) => {
    // What a person would call it: its label, its text, or its placeholder.
    const nameOf = (element: HTMLElement): string =>
      element.getAttribute("aria-label") ||
      (element as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
      element.textContent?.trim() ||
      element.getAttribute("placeholder") ||
      element.id ||
      "unnamed";
    const problems: string[] = [];
    const selector =
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea";
    for (const field of document.querySelectorAll<HTMLElement>(selector)) {
      if (field.getBoundingClientRect().width === 0) continue;
      const size = Number.parseFloat(getComputedStyle(field).fontSize);
      if (size < minimum) {
        problems.push(`${field.tagName.toLowerCase()} "${nameOf(field)}" has ${size}px text`);
      }
    }
    return problems;
  }, TEXT_INPUT);
}

test("every control fits its panel and the page", async ({ signIn }, testInfo) => {
  const touch = Boolean(testInfo.project.use.hasTouch);
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  const admin = await signIn("pat");

  // The station screens must also suit a finger. The admin screens are used at a desk.
  async function check(page: Page, station: boolean): Promise<string[]> {
    const problems = [...(await controlsOutsidePanels(page)), ...(await scrollsSideways(page))];
    if (touch && station) {
      problems.push(...(await smallTargets(page)), ...(await smallTextFields(page)));
    }
    return problems;
  }

  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 5, method: "East", seniorBox: true });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await addCard(frontDesk, { familySize: 2, method: "Walk" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (2)" })).toBeVisible();
  expect(await check(frontDesk, true)).toEqual([]);

  await frontDesk.getByRole("button", { name: "Help" }).click();
  await expect(frontDesk.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();
  expect(await check(frontDesk, true)).toEqual([]);
  await frontDesk.getByRole("button", { name: "Front desk", exact: true }).click();

  // The list shows the newest card first, and a called card loses this button.
  await callBack(frontDesk);
  await expect(frontDesk.getByRole("button", { name: "Undo call back" })).toHaveCount(1);
  await callBack(frontDesk);
  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Confirm" }).click();
  await card.getByRole("button", { name: "Correct details" }).click();
  expect(await check(distribution, true)).toEqual([]);

  await admin.getByRole("button", { name: "Admin", exact: true }).click();
  await admin.getByRole("button", { name: "Show totals" }).click();
  await admin
    .locator(".account")
    .filter({ hasText: "front-desk" })
    .getByRole("button", { name: "Change password" })
    .click();
  await expect(admin.locator(".report-combined")).toBeVisible();
  expect(await check(admin, false)).toEqual([]);

  await admin.getByRole("button", { name: "Totals", exact: true }).click();
  expect(await check(admin, false)).toEqual([]);

  // The first screen on a station is the sign-in form.
  await frontDesk.getByRole("button", { name: "Sign out" }).click();
  await expect(frontDesk.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await check(frontDesk, true)).toEqual([]);
});
