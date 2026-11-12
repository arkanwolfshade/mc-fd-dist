import {
  addCard,
  addPartnerFamily,
  cardRow,
  cartInputs,
  expect,
  fillCarts,
  infoFrom,
  openShift,
  partnerPanel,
  partnerRow,
  queueCard,
  test,
  tickExtras,
  totalsRow,
} from "./fixtures.js";
import type { Page } from "@playwright/test";

async function callBackCard(frontDesk: Page, number: number): Promise<void> {
  await cardRow(frontDesk, number).getByRole("button", { name: "Call back" }).click();
}

test("Info from is required, and initials used this shift become quick buttons", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  const error = frontDesk.locator(".error");
  const quickButtons = infoFrom(frontDesk).getByRole("button");
  await expect(quickButtons).toHaveCount(0);

  await addCard(frontDesk, { familySize: 3, method: "Walk", initials: null });
  await expect(error).toHaveText("Choose who the Family's details came from.");

  await frontDesk.getByLabel("New initials").fill("A1");
  await frontDesk.getByRole("button", { name: "Save card" }).click();
  await expect(error).toHaveText("Choose who the Family's details came from.");

  // Typed in lower case, kept in capitals.
  await frontDesk.getByLabel("New initials").fill("zy");
  await frontDesk.getByRole("button", { name: "Save card" }).click();
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await expect(error).toHaveCount(0);
  await expect(frontDesk.getByLabel("New initials")).toHaveValue("");
  await expect(quickButtons).toHaveText(["ZY"]);

  await addCard(frontDesk, { familySize: 2, method: "East", initials: "AB" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (2)" })).toBeVisible();
  await expect(quickButtons).toHaveText(["AB", "ZY"]);

  // The quick button fills in the initials with one tap.
  await addCard(frontDesk, { familySize: 4, method: "Bus", initials: "ZY" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (3)" })).toBeVisible();
  await expect(quickButtons).toHaveText(["AB", "ZY"]);

  await callBackCard(frontDesk, 3);
  await expect(queueCard(distribution, 3).locator(".queue-head")).toContainText("Info from ZY");
});

test("cart weights follow the Family's size", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "East" });
  await addCard(frontDesk, { familySize: 6, method: "West" });
  await addCard(frontDesk, { familySize: 10, method: "Walk" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (3)" })).toBeVisible();
  for (const number of [1, 2, 3]) {
    await callBackCard(frontDesk, number);
  }

  for (const [number, carts] of [
    [1, ["Cart 1 (lb)"]],
    [2, ["Cart 1 (lb)", "Cart 2 (lb)"]],
    [3, ["Cart 1 (lb)", "Cart 2 (lb)", "Cart 3 (lb)"]],
  ] as const) {
    const card = queueCard(distribution, number);
    await card.getByRole("button", { name: `Confirm card ${number}` }).click();
    await expect(cartInputs(card)).toHaveCount(carts.length);
    for (const label of carts) {
      await expect(card.getByLabel(label)).toBeVisible();
    }
  }

  // A correction to the size changes the carts with the TEFAP bags.
  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Correct details" }).click();
  await card.locator(".correct").getByLabel("# in Family").fill("9");
  await card.getByRole("button", { name: "Save correction" }).click();
  await expect(card).toContainText("3 TEFAP bags");
  await expect(cartInputs(card)).toHaveCount(3);
});

test("the extras check is asked for a Family of 6, and not for a Family of 8", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 6, method: "East" });
  await addCard(frontDesk, { familySize: 8, method: "West" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (2)" })).toBeVisible();
  await callBackCard(frontDesk, 1);
  await callBackCard(frontDesk, 2);

  const six = queueCard(distribution, 1);
  await six.getByRole("button", { name: "Confirm card 1" }).click();
  await expect(six.getByLabel("Extras added")).toBeVisible();
  await expect(six.getByLabel("Extras added")).not.toBeChecked();
  await expect(six.getByLabel("What was added")).toBeVisible();

  const eight = queueCard(distribution, 2);
  await eight.getByRole("button", { name: "Confirm card 2" }).click();
  await expect(cartInputs(eight)).toHaveCount(2);
  await expect(eight.getByLabel("Extras added")).toHaveCount(0);
  await expect(eight.getByLabel("What was added")).toHaveCount(0);
});

test("missing cart weights and extras are named before a Family is distributed", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 6, method: "Bus" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await callBackCard(frontDesk, 1);

  const card = queueCard(distribution, 1);
  const warning = card.locator(".confirm");
  await card.getByRole("button", { name: "Confirm card 1" }).click();
  await fillCarts(card, ["10"]);
  await card.getByRole("button", { name: "Mark distributed" }).click();
  await expect(warning.locator("p")).toHaveText([
    "Cart 2 has no weight.",
    "Extras added is not ticked.",
  ]);

  await warning.getByRole("button", { name: "Go back" }).click();
  await expect(warning).toHaveCount(0);
  await expect(distribution.getByRole("heading", { name: "Queue (1)" })).toBeVisible();

  await tickExtras(card, "Meat");
  await card.getByRole("button", { name: "Mark distributed" }).click();
  await expect(warning.locator("p")).toHaveText(["Cart 2 has no weight."]);
  await warning.getByRole("button", { name: "Mark distributed anyway" }).click();

  await expect(distribution.getByRole("heading", { name: "Distributed (1)" })).toBeVisible();
  const done = cardRow(distribution, 1);
  await expect(done).toContainText("10 lb");
  await expect(done).toContainText("Extras: Meat");
});

test("a Door Dash Family entered at the end of the shift counts in the totals", async ({
  signIn,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 2, method: "Walk" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();

  const panel = partnerPanel(distribution);
  await expect(
    distribution.getByRole("heading", { name: "End of shift: Door Dash and Helping Hands (0)" }),
  ).toBeVisible();
  // The browser asks for the required numbers first, so they are filled in to reach the
  // partner check.
  await panel.getByLabel("Card #").fill("2");
  await panel.getByLabel("# in Family").fill("4");
  await panel.getByRole("button", { name: "Add partner Family" }).click();
  await expect(panel.locator(".error")).toHaveText("Choose a partner.");

  await addPartnerFamily(distribution, {
    partner: "Door Dash",
    number: 2,
    familySize: 4,
    carts: ["40"],
  });
  await expect(
    distribution.getByRole("heading", { name: "End of shift: Door Dash and Helping Hands (1)" }),
  ).toBeVisible();
  const row = partnerRow(distribution, 2);
  await expect(row).toContainText("Family of 4");
  await expect(row).toContainText("Door Dash");
  await expect(row).toContainText("40 lb");

  // Partner Families never pass the front desk, so they stay off its list and the queue.
  await expect(cardRow(frontDesk, 2)).toHaveCount(0);
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await expect(queueCard(distribution, 2)).toHaveCount(0);
  await expect(distribution.getByRole("heading", { name: "Distributed (0)" })).toBeVisible();

  for (const station of [frontDesk, distribution]) {
    await station.getByRole("button", { name: "Totals", exact: true }).click();
    await expect(totalsRow(station, "Door Dash and Helping Hands").locator("td")).toHaveText([
      "1",
      "40 lb",
    ]);
    await expect(totalsRow(station, "Total weight")).toContainText("40 lb");
  }
});

test("a partner Family cannot reuse a card number from the front desk", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "East" });
  await expect(frontDesk.getByRole("heading", { name: "Cards (1)" })).toBeVisible();
  await expect(distribution.getByRole("heading", { name: "Queue (0)" })).toBeVisible();

  await addPartnerFamily(distribution, {
    partner: "Helping Hands",
    number: 1,
    familySize: 2,
    carts: ["12"],
  });
  const panel = partnerPanel(distribution);
  await expect(panel.locator(".error")).toContainText("already in use");
  await expect(partnerRow(distribution, 1)).toHaveCount(0);
  await expect(
    distribution.getByRole("heading", { name: "End of shift: Door Dash and Helping Hands (0)" }),
  ).toBeVisible();
});
