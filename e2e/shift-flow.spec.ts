import {
  addCard,
  addPartnerFamily,
  callBack,
  cardRow,
  expect,
  fillCarts,
  openShift,
  partnerPanel,
  partnerRow,
  PASSWORD,
  queueCard,
  test,
  tickExtras,
  totalsRow,
} from "./fixtures.js";

test("a card moves between stations live, with no reload", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");

  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 5, method: "East", seniorBox: true });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();

  // Distribution learns of the shift from the first update, and an uncalled card is not queued.
  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();

  await callBack(frontDesk);
  await expect(distribution.getByRole("heading", { name: "Queue (1)" })).toBeVisible();
  const card = queueCard(distribution, 1);
  await expect(card).toContainText("Family of 5");
  await expect(card).toContainText("Senior Box");
  await expect(card).toContainText("2 TEFAP bags");
  await expect(card).toContainText("Info from AB");

  await card.getByRole("button", { name: "Confirm" }).click();
  await fillCarts(card, ["12.5", "8"]);
  await tickExtras(card, "Bakery");
  await card.getByRole("button", { name: "Mark distributed" }).click();

  // Nothing was missing, so there is no warning to answer.
  await expect(distribution.getByRole("heading", { name: "Distributed (1)" })).toBeVisible();
  const done = cardRow(distribution, 1);
  await expect(done).toContainText("20.5 lb");
  await expect(done).toContainText("Extras: Bakery");
  await expect(frontDesk.locator(".status")).toHaveText("Distributed");
});

test("the front desk previews TEFAP bags and requires a location or transport", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);

  await frontDesk.getByLabel("# in Family").fill("9");
  await expect(frontDesk.locator(".tefap strong")).toHaveText("3");
  await frontDesk.getByLabel("New initials").fill("AB");

  await frontDesk.getByRole("button", { name: "Save card" }).click();
  await expect(frontDesk.locator(".error")).toHaveText(
    "Choose the Family's location or transport.",
  );
  await expect(
    frontDesk.getByRole("group", { name: "Location or transport" }).getByRole("button"),
  ).toHaveText(["East", "West", "Around corner", "Bus", "Walk"]);
});

test("a duplicate card number is refused", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 2, method: "West" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();

  await addCard(frontDesk, { familySize: 2, method: "West", number: 1 });
  await expect(frontDesk.locator(".error")).toHaveText(
    /^Card 1 \(Family of 2, West\) was not saved: That card number is already in use$/i,
  );
  // The details come back, so that only the number needs changing.
  await expect(frontDesk.getByLabel("# in Family")).toHaveValue("2");
  await expect(frontDesk.getByRole("button", { name: "West", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the next family can be typed while the last card is still saving", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  let delayed = false;
  await frontDesk.route("**/api/shifts/*/cards", async (route) => {
    if (!delayed) {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await route.continue();
  });

  await addCard(frontDesk, { familySize: 5, method: "East" });
  await addCard(frontDesk, { familySize: 9, method: "Walk", seniorBox: true });

  await expect(frontDesk.getByRole("heading", { name: "Cards (2)" })).toBeVisible();
  const first = cardRow(frontDesk, 1);
  const second = cardRow(frontDesk, 2);
  await expect(first.locator(".family")).toHaveText("Family of 5");
  await expect(first.locator(".details")).toHaveText("East");
  await expect(second.locator(".family")).toHaveText("Family of 9");
  await expect(second.locator(".details")).toHaveText("Walk, Senior Box");
});

test("a correction at distribution reaches the front desk live", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 5, method: "East" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await callBack(frontDesk);

  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Correct details" }).click();
  await card.locator(".correct").getByLabel("# in Family").fill("2");
  await card.getByRole("button", { name: "Save correction" }).click();

  await expect(card).toContainText("Family of 2");
  await expect(card).toContainText("1 TEFAP bag");
  await expect(cardRow(frontDesk, 1).locator(".family")).toHaveText("Family of 2");
});

test("the correction form uses the volunteers' words", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "Walk" });
  await callBack(frontDesk);

  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Correct details" }).click();
  const correct = card.locator(".correct");
  await expect(correct.getByText("Location or transport")).toBeVisible();
  await expect(correct.getByLabel("# in Family")).toHaveValue("3");
  await expect(correct.getByRole("button", { name: "Senior Box" })).toBeVisible();
});

test("distributing without a weight asks first, then flags it in the totals", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "Bus" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await callBack(frontDesk);

  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Confirm" }).click();
  await card.getByRole("button", { name: "Mark distributed" }).click();
  await expect(card.locator(".confirm")).toContainText("Cart 1 has no weight.");

  // Going back keeps the card in the queue.
  await card.getByRole("button", { name: "Go back" }).click();
  await expect(card.locator(".confirm")).toHaveCount(0);

  await card.getByRole("button", { name: "Mark distributed" }).click();
  await card.getByRole("button", { name: "Mark distributed anyway" }).click();
  await expect(distribution.getByRole("heading", { name: "Distributed (1)" })).toBeVisible();
  await expect(cardRow(distribution, 1)).toContainText("no weight");

  await distribution.getByRole("button", { name: "Totals" }).click();
  await expect(distribution.locator(".warning-inline")).toContainText(
    "1 distributed card has no weight",
  );
});

test("totals combine cards, partner Families and returned items at every station", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 9, method: "Walk", seniorBox: true });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await callBack(frontDesk);

  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Confirm" }).click();
  await fillCarts(card, ["10", "6.5", "4"]);
  await tickExtras(card, "Deli");
  await card.getByRole("button", { name: "Mark distributed" }).click();
  await expect(distribution.getByRole("heading", { name: "Distributed (1)" })).toBeVisible();

  const returned = distribution.locator("section", { hasText: "Returned items" });
  await returned.getByLabel("Weight (lb)").fill("3.5");
  await returned.getByRole("button", { name: "Add returned weight" }).click();
  await expect(distribution.getByRole("heading", { name: "Returned items (1)" })).toBeVisible();

  await addPartnerFamily(distribution, {
    partner: "Door Dash",
    number: 2,
    familySize: 4,
    carts: ["40"],
  });
  const doorDash = partnerRow(distribution, 2);
  await expect(doorDash).toContainText("Door Dash");
  await expect(doorDash).toContainText("Family of 4");
  await expect(doorDash).toContainText("40 lb");

  // Weights in hundredths must be accepted: a form once silently refused 9.25.
  await addPartnerFamily(distribution, {
    partner: "Helping Hands",
    number: 3,
    familySize: 2,
    carts: ["9.25"],
  });
  await expect(partnerRow(distribution, 3)).toContainText("Helping Hands");
  await expect(partnerRow(distribution, 3)).toContainText("9.25 lb");
  await expect(
    distribution.getByRole("heading", {
      name: "End of shift: Door Dash and Helping Hands (2)",
    }),
  ).toBeVisible();
  await expect(partnerPanel(distribution).locator(".error")).toHaveCount(0);

  // The front desk received the partner Families live.
  await frontDesk.getByRole("button", { name: "Totals" }).click();
  await expect(totalsRow(frontDesk, "Total # of families")).toContainText("3");
  await expect(totalsRow(frontDesk, "Door Dash and Helping Hands").locator("td")).toHaveText([
    "2",
    "49.25 lb",
  ]);
  await expect(totalsRow(frontDesk, "Total weight")).toContainText("69.75 lb");
  await expect(totalsRow(frontDesk, "Total return weight")).toContainText("3.5 lb");
  await expect(totalsRow(frontDesk, "Net weight")).toContainText("66.25 lb");
  await expect(totalsRow(frontDesk, "Total # of senior boxes")).toContainText("1");
});

test("a station acting on an outdated card is told to review it", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "Around corner" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await callBack(frontDesk);
  await expect(distribution.getByRole("heading", { name: "Queue (1)" })).toBeVisible();

  // This station's live updates are dropped, so it keeps showing the old revision.
  const outdated = await signIn("distribution", { muteLive: true });
  await expect(outdated.getByRole("heading", { name: "Queue (1)" })).toBeVisible();

  await queueCard(distribution, 1).getByRole("button", { name: "Confirm" }).click();
  await expect(queueCard(distribution, 1).getByLabel("Cart 1 (lb)")).toBeVisible();

  await queueCard(outdated, 1).getByRole("button", { name: "Confirm" }).click();
  await expect(outdated.locator(".error")).toContainText("changed at another station");
  await expect(queueCard(outdated, 1).locator(".status")).toHaveText("Confirmed");
});

test("a station that loses its connection warns, then recovers the missed updates", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "East" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();

  await distribution.context().setOffline(true);
  await distribution.evaluate(() => window.dispatchEvent(new Event("offline")));
  await callBack(frontDesk);
  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();

  await distribution.context().setOffline(false);
  await expect(distribution.getByRole("heading", { name: "Queue (1)" })).toBeVisible({
    timeout: 15000,
  });
});

test("a station left signed in overnight moves on to the new day", async ({
  browser,
  serverUrl,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install({ time: new Date(2026, 10, 7, 20, 0) });
  await page.goto(serverUrl);
  await page.getByLabel("Username").fill("front-desk");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Saturday, November 7")).toBeVisible();
  await openShift(page);

  // A resync for the old day that answers late must not bring the old shift back.
  await page.route("**/api/shifts?date=2026-11-07", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.clock.fastForward("03:59:45");
  await page.clock.fastForward("00:01:00");

  await expect(page.getByText("Sunday, November 8")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open today's shift" })).toBeVisible();
  // Still the new day once the late answer for the old day has arrived.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await expect(page.getByRole("button", { name: "Open today's shift" })).toBeVisible();
  await context.close();
});

test("wrong passwords are refused", async ({ signIn }) => {
  const page = await signIn("front-desk", { password: "not-the-password" });
  await expect(page.locator(".error")).toHaveText("Incorrect username or password");
});

test("signing out returns to the sign-in screen and stays signed out", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await frontDesk.getByRole("button", { name: "Sign out" }).click();
  await expect(frontDesk.getByLabel("Username")).toBeVisible();
  await frontDesk.reload();
  await expect(frontDesk.getByLabel("Username")).toBeVisible();
});
