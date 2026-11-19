import { addCard, expect, openShift, test, totalsRow } from "./fixtures.js";

// What a screen-reader user meets: the page's structure, what each button is called,
// what gets announced, and where keyboard focus goes.

test("a failed sign-in is announced", async ({ signIn }) => {
  const page = await signIn("front-desk", { password: "not-the-password" });
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveText("Incorrect username or password");
});

test("each screen has one main area and a top-level heading, which a screen change moves focus to", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await expect(frontDesk.getByRole("main")).toHaveCount(1);
  await expect(frontDesk.getByRole("heading", { level: 1 })).toHaveText("Front desk");

  const screens = frontDesk.getByRole("navigation", { name: "Screens" });
  await screens.getByRole("button", { name: "Totals" }).click();
  await expect(frontDesk.getByRole("heading", { level: 1, name: "Totals" })).toBeFocused();
});

test("the card form announces a missing choice and each saved card", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  // Present before the first save, so that the first one is announced too.
  await expect(frontDesk.getByRole("status")).toBeAttached();

  await frontDesk.getByLabel("# in Family").fill("4");
  await frontDesk.getByRole("button", { name: /^Save card/ }).click();
  await expect(
    frontDesk.getByRole("alert").filter({ hasText: "Choose the Family's location or transport." }),
  ).toBeVisible();

  await addCard(frontDesk, { familySize: 4, method: "Walk" });
  await expect(frontDesk.getByRole("status")).toContainText("Saved: Family of 4");
});

test("buttons in the card list say which card they act on", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 4, method: "Walk" });
  await addCard(frontDesk, { familySize: 2, method: "Bus" });

  await expect(
    frontDesk.getByRole("button", { name: "Call back card 1", exact: true }),
  ).toBeVisible();
  await expect(
    frontDesk.getByRole("button", { name: "Call back card 2", exact: true }),
  ).toBeVisible();
  await frontDesk.getByRole("button", { name: "Call back card 2", exact: true }).click();
  await expect(
    frontDesk.getByRole("button", { name: "Undo call back card 2", exact: true }),
  ).toBeVisible();
});

test("asking to delete keeps focus in the question, and answering puts it somewhere sensible", async ({
  signIn,
}) => {
  const admin = await signIn("pat");
  await openShift(admin);
  await addCard(admin, { familySize: 3, method: "East" });

  await admin.getByRole("button", { name: "Delete card 1", exact: true }).click();
  const cancel = admin.getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toBeFocused();
  await expect(admin.getByRole("button", { name: "Yes, delete" })).toHaveAccessibleDescription(
    "Delete card #1? This cannot be undone.",
  );

  await cancel.press("Enter");
  await expect(admin.getByRole("button", { name: "Delete card 1", exact: true })).toBeFocused();

  await admin.getByRole("button", { name: "Delete card 1", exact: true }).press("Enter");
  await admin.getByRole("button", { name: "Yes, delete" }).press("Enter");
  await expect(admin.getByRole("heading", { name: "Cards (0)" })).toBeFocused();
});

test("losing and regaining the connection is announced", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  const announcements = frontDesk.locator('[aria-live="polite"]');

  await frontDesk.context().setOffline(true);
  await expect(announcements).toContainText("Connection lost");
  await frontDesk.context().setOffline(false);
  await expect(announcements).toContainText("Connected again");
});

test("totals say which total each breakdown row belongs to", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 4, method: "Walk" });
  await frontDesk
    .getByRole("navigation", { name: "Screens" })
    .getByRole("button", { name: "Totals" })
    .click();

  await expect(totalsRow(frontDesk, "Families: Cards")).toContainText("1");
  await expect(totalsRow(frontDesk, "Weight: Cards")).toContainText("lb");
});

test("admin buttons name the account they change", async ({ signIn }) => {
  const admin = await signIn("pat");
  await admin
    .getByRole("navigation", { name: "Screens" })
    .getByRole("button", { name: "Admin" })
    .click();
  await expect(
    admin.getByRole("button", { name: "Change password for front-desk", exact: true }),
  ).toBeVisible();
});
