import { addCard, callBack, cardRow, expect, openShift, queueCard, test } from "./fixtures.js";

function today(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

test("the header names the station and the day in words", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const bar = frontDesk.locator(".bar");
  await expect(bar.locator(".station-name")).toHaveText("Front desk");
  await expect(bar.locator(".station-date")).toHaveText(today());
  await expect(bar.locator(".connection")).toHaveText("Connected");

  const distribution = await signIn("distribution");
  await expect(distribution.locator(".station-name")).toHaveText("Distribution");

  await frontDesk.context().setOffline(true);
  await expect(bar.locator(".connection")).toHaveText("Offline");
});

test("the next card number is shown as a ticket, and follows a typed number", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  const next = frontDesk.locator(".next-card .ticket");
  await expect(next).toHaveText("1");
  await frontDesk.getByLabel("Card #").fill("7");
  await expect(next).toHaveText("7");
  await expect(frontDesk.getByRole("button", { name: "Save card 7" })).toBeVisible();
});

test("a saved card is confirmed with its number and details", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 5, method: "East", seniorBox: true });
  await expect(frontDesk.locator(".saved")).toHaveText("1 Saved: Family of 5, East, Senior Box");
});

test("each card in the line shows its ticket, family and status", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 9, method: "Walk", seniorBox: true, cheese: true });
  const row = cardRow(frontDesk, 1);
  await expect(row.locator(".family")).toHaveText("Family of 9");
  await expect(row.locator(".details")).toHaveText("Walk, Senior Box and Cheese");
  await expect(row.locator(".status")).toHaveText("Waiting");
});

test("distribution sees what to give on its own line", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 6, method: "Bus", seniorBox: true, cheese: true });
  await callBack(frontDesk);

  const card = queueCard(distribution, 1);
  await expect(card.locator(".give li")).toHaveText(["2 TEFAP bags", "Senior Box", "Cheese"]);
  await expect(card.getByRole("button", { name: "Confirm card 1" })).toBeVisible();
  await expect(card.locator(".queue-head")).toContainText("Info from AB");
});

test("signing out is a quiet link, not a tab", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await expect(frontDesk.locator(".tabs").getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(frontDesk.locator(".bar .signout")).toHaveText("Sign out");
});
