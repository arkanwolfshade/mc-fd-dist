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
  await expect(card.locator(".queue-head")).toContainText("Intake: AB");
});

test("signing out is a quiet link, not a tab", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await expect(frontDesk.locator(".tabs").getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(frontDesk.locator(".bar .signout")).toHaveText("Sign out");
});

test("on a wide screen the card number, family size and TEFAP bags share a row", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  const number = await frontDesk.getByLabel("Card #").boundingBox();
  const bags = await frontDesk.locator(".tefap").boundingBox();
  expect(bags?.y).toBeLessThan((number?.y ?? 0) + (number?.height ?? 0));
});

test("the intake operator is asked first, under the next card number", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  const operator = await frontDesk.getByRole("group", { name: "Intake operator" }).boundingBox();
  const number = await frontDesk.getByLabel("Card #").boundingBox();
  expect(operator?.y).toBeLessThan(number?.y ?? 0);
});

// The ? is on the field's name line, right after the name, not across the row (ADR 0038).
test("each help button sits right after the name of what it explains", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  for (const [name, title] of [
    ["Card #", "Card numbers"],
    ["Intake operator", "Whose initials to enter"],
    ["For seniors", "Boxes for seniors"],
  ]) {
    // The name is the line's first child; the popout's own text also mentions it.
    const nameText = frontDesk.locator(".name-line > :first-child", { hasText: name });
    const words = await nameText.boundingBox();
    const label = await nameText.locator("..").boundingBox();
    const help = await frontDesk
      .getByRole("button", { name: `Help: ${title}`, exact: true })
      .boundingBox();
    // Within a few pixels of the name's end, and on its line.
    expect(help?.x ?? 0, name).toBeLessThan((words?.x ?? 0) + (words?.width ?? 0) + 12);
    expect(help?.y ?? 0, name).toBeGreaterThanOrEqual((label?.y ?? 0) - 0.5);
    expect((help?.y ?? 0) + (help?.height ?? 0), name).toBeLessThanOrEqual(
      (label?.y ?? 0) + (label?.height ?? 0) + 0.5,
    );
  }
});

test("on a wide screen distribution's queue gets the wide column", async ({ signIn }) => {
  const distribution = await signIn("distribution");
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  const queue = await distribution.locator("section.panel", { hasText: "Queue (" }).boundingBox();
  const done = await distribution
    .locator("section.panel", { hasText: "Distributed (" })
    .boundingBox();
  const finish = await distribution.locator("section.panel", { hasText: "Finish" }).boundingBox();
  expect(queue?.width ?? 0).toBeGreaterThan((done?.width ?? 0) * 1.5);
  // Everything else shares the narrow column beside it.
  expect(finish?.x).toBe(done?.x);
  expect(done?.x ?? 0).toBeGreaterThan(queue?.x ?? 0);
});
