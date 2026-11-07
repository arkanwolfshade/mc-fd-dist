import type { Page } from "@playwright/test";
import { addCard, callForward, expect, openShift, queueCard, test } from "./fixtures.js";

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
          problems.push(`${control.textContent || control.outerHTML.slice(0, 60)} leaves its panel`);
        }
        if (box.right > viewportWidth + 0.5) {
          problems.push(`${control.textContent || control.outerHTML.slice(0, 60)} leaves the screen`);
        }
      }
    }
    return problems;
  });
}

const WIDTHS = [
  { name: "a phone", width: 360, height: 740 },
  { name: "a small tablet", width: 768, height: 1024 },
  { name: "a laptop", width: 1100, height: 800 },
];

for (const { name, width, height } of WIDTHS) {
  test(`every control stays inside its panel on ${name}`, async ({ signIn }) => {
    const frontDesk = await signIn("front-desk");
    const distribution = await signIn("distribution");
    const admin = await signIn("pat");
    for (const page of [frontDesk, distribution, admin]) {
      await page.setViewportSize({ width, height });
    }

    await openShift(frontDesk);
    await addCard(frontDesk, { familySize: 5, method: "East", seniorBox: true });
    await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
    await addCard(frontDesk, { familySize: 2, method: "Walk" });
    await expect(frontDesk.getByRole("heading", { name: "Cards (2)" })).toBeVisible();
    expect(await controlsOutsidePanels(frontDesk)).toEqual([]);

    // The list shows the newest card first, and a called card loses this button.
    await callForward(frontDesk);
    await expect(frontDesk.getByRole("button", { name: "Undo call" })).toHaveCount(1);
    await callForward(frontDesk);
    const card = queueCard(distribution, 1);
    await card.getByRole("button", { name: "Confirm" }).click();
    await card.getByRole("button", { name: "Correct details" }).click();
    expect(await controlsOutsidePanels(distribution)).toEqual([]);

    await admin.getByRole("button", { name: "Admin", exact: true }).click();
    await admin.getByRole("button", { name: "Show totals" }).click();
    await admin
      .locator(".account")
      .filter({ hasText: "front-desk" })
      .getByRole("button", { name: "Change password" })
      .click();
    await expect(admin.locator(".report-combined")).toBeVisible();
    expect(await controlsOutsidePanels(admin)).toEqual([]);

    await admin.getByRole("button", { name: "Totals", exact: true }).click();
    expect(await controlsOutsidePanels(admin)).toEqual([]);
  });
}
