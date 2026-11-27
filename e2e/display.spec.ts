import type { Locator, Page } from "@playwright/test";
import { addCard, expect, openShift, queueCard, test } from "./fixtures.js";

// The wall display in the distribution room. See ADR 0033.
test.use({ withDisplay: true });

function group(wall: Page, name: "Confirmed" | "Called"): Locator {
  return wall.locator("section.wall-group").filter({ hasText: name });
}

function numbers(wall: Page, name: "Confirmed" | "Called"): Locator {
  return group(wall, name).locator(".ticket");
}

test("the wall lists the queue in the order families were called, confirmed apart from called", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  const wall = await signIn("wall");

  await expect(wall.getByRole("heading", { level: 1, name: "Distribution queue" })).toBeVisible();
  await expect(wall.getByText("No shift is open today")).toBeVisible();

  await openShift(frontDesk);
  await expect(wall.getByText("No families are waiting")).toBeVisible();

  for (const number of [1, 2, 3]) {
    await addCard(frontDesk, {
      number,
      familySize: 5,
      method: "East",
      seniorBox: number === 1,
      other: "allergic to peanuts",
    });
    await expect(frontDesk.getByRole("heading", { name: `Cards (${number})` })).toBeVisible();
  }
  await expect(wall.getByText("No families are waiting")).toBeVisible();

  for (const number of [3, 1, 2]) {
    await frontDesk.getByRole("button", { name: `Call back card ${number}`, exact: true }).click();
  }
  await expect(numbers(wall, "Called")).toHaveText(["3", "1", "2"]);
  await expect(numbers(wall, "Confirmed")).toHaveCount(0);

  await queueCard(distribution, 3).getByRole("button", { name: "Confirm card 3" }).click();
  await expect(numbers(wall, "Confirmed")).toHaveText(["3"]);
  await expect(numbers(wall, "Called")).toHaveText(["1", "2"]);

  // What a volunteer needs to stage the carts, and nothing that says who the Family is.
  const first = wall
    .locator(".wall-row")
    .filter({ has: wall.locator(".ticket", { hasText: /^1$/ }) });
  await expect(first).toContainText("5 people");
  await expect(first).toContainText("2 carts");
  await expect(first).toContainText("Senior Box");
  await expect(wall.getByRole("main")).not.toContainText("peanuts");
  await expect(wall.getByRole("main")).not.toContainText("Intake");

  // A family served leaves the wall.
  await expect(group(wall, "Confirmed")).toContainText("Confirmed (1)");
});

test("the wall gives its last place to a count of those further back", async ({
  signIn,
  serverUrl,
}) => {
  const frontDesk = await signIn("front-desk");
  const wall = await signIn("wall");
  await openShift(frontDesk);

  const today = await frontDesk.evaluate(() => {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((part) => String(part).padStart(2, "0"))
      .join("-");
  });
  const shift = await (await frontDesk.request.get(`${serverUrl}api/shifts?date=${today}`)).json();
  const CALLED = 30;
  for (let number = 1; number <= CALLED; number++) {
    const created = await frontDesk.request.post(`${serverUrl}api/shifts/${shift.id}/cards`, {
      data: {
        clientId: crypto.randomUUID(),
        number,
        familySize: 3,
        arrivalMethod: "Walk",
        seniorBox: false,
        cheese: false,
        other: "",
        intakeInitials: "AB",
      },
    });
    expect(created.ok(), `creating card ${number}`).toBe(true);
    const card = await created.json();
    const called = await frontDesk.request.patch(`${serverUrl}api/cards/${card.id}`, {
      data: { revision: card.revision, status: "called" },
    });
    expect(called.ok(), `calling card ${number}`).toBe(true);
  }

  // Read the list only once the wall has heard of every family, so a slow update is not
  // mistaken for a missing one.
  await expect(group(wall, "Called")).toContainText(`Called (${CALLED})`);

  const more = wall.locator(".wall-more");
  await expect(more).toHaveText(/^\+\d+ more waiting$/);
  const hidden = Number((await more.innerText()).match(/\d+/)?.[0]);
  const shown = await numbers(wall, "Called").allInnerTexts();

  // The front of the queue is what shows, in order, with nobody lost.
  expect(shown.length).toBeGreaterThan(3);
  expect(shown).toEqual(shown.map((_, index) => String(index + 1)));
  expect(shown.length + hidden).toBe(CALLED);
  await expect(group(wall, "Called")).toContainText(`Called (${CALLED})`);
});

test("the wall hides the queue when it cannot be trusted, and shows it again when the connection returns", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const wall = await signIn("wall", { installClock: true });
  await openShift(frontDesk);
  await addCard(frontDesk, { number: 4, familySize: 2, method: "Walk" });
  await frontDesk.getByRole("button", { name: "Call back card 4", exact: true }).click();
  await expect(numbers(wall, "Called")).toHaveText(["4"]);

  // The wall reloads every 30 seconds. With that failing, it is forgiven for 20 seconds more.
  await wall.route("**/api/display*", (route) => route.abort());
  await wall.clock.fastForward(31_000);
  await expect(numbers(wall, "Called")).toHaveText(["4"]);
  await wall.clock.fastForward(21_000);

  await expect(wall.getByRole("alert")).toContainText("Not connected");
  await expect(wall.getByRole("alert")).toContainText("Last updated");
  await expect(wall.locator(".ticket")).toHaveCount(0);

  await wall.unroute("**/api/display*");
  await wall.clock.fastForward(31_000);
  await expect(wall.getByRole("alert")).toHaveCount(0);
  await expect(numbers(wall, "Called")).toHaveText(["4"]);
});

test("a reload answered late does not wipe a change the wall heard while it was waiting", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const wall = await signIn("wall");
  await openShift(frontDesk);
  for (const number of [1, 2, 3]) {
    await addCard(frontDesk, { number, familySize: 2, method: "Walk" });
    await expect(frontDesk.getByRole("heading", { name: `Cards (${number})` })).toBeVisible();
  }
  await frontDesk.getByRole("button", { name: "Call back card 1", exact: true }).click();
  await expect(numbers(wall, "Called")).toHaveText(["1"]);

  // The next reload asks the server now, but the wall is told the answer only when released.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let taken!: () => void;
  const snapshotTaken = new Promise<void>((resolve) => {
    taken = resolve;
  });
  await wall.route("**/api/display*", async (route) => {
    const response = await route.fetch();
    taken();
    await held;
    await route.fulfill({ response });
  });
  await wall.evaluate(() => window.dispatchEvent(new Event("online")));
  await snapshotTaken;

  // A family is called after the server answered, so the answer does not include them.
  await frontDesk.getByRole("button", { name: "Call back card 2", exact: true }).click();
  await expect(numbers(wall, "Called")).toHaveText(["1", "2"]);

  const answered = wall.waitForResponse((response) => response.url().includes("/api/display"));
  release();
  await answered;

  // Another change arrives after the old answer, which shows what the old answer left behind.
  await frontDesk.getByRole("button", { name: "Call back card 3", exact: true }).click();
  await expect(numbers(wall, "Called")).toHaveText(["1", "2", "3"]);
});
