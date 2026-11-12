import { addCard, callBack, cardRow, expect, openShift, queueCard, test } from "./fixtures.js";

test("Cheese is offered only once a Senior Box is ticked", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  const seniorBox = frontDesk.getByRole("button", { name: "Senior Box" });
  const cheese = frontDesk.getByRole("button", { name: "Cheese" });

  await expect(cheese).toBeDisabled();
  await seniorBox.click();
  await expect(cheese).toBeEnabled();
  await cheese.click();
  await expect(cheese).toHaveAttribute("aria-pressed", "true");

  // Taking the Senior Box away takes the Cheese with it.
  await seniorBox.click();
  await expect(cheese).toBeDisabled();
  await expect(cheese).toHaveAttribute("aria-pressed", "false");
});

test("correcting a card keeps Cheese with the Senior Box", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 4, method: "East", seniorBox: true, cheese: true });
  await callBack(frontDesk);

  const card = queueCard(distribution, 1);
  await card.getByRole("button", { name: "Correct details" }).click();
  const correct = card.locator(".correct");
  await correct.getByRole("button", { name: "Senior Box" }).click();
  await expect(correct.getByRole("button", { name: "Cheese" })).toBeDisabled();
  await correct.getByRole("button", { name: "Save correction" }).click();

  await expect(card).not.toContainText("senior box", { ignoreCase: true });
  await expect(card).not.toContainText("cheese", { ignoreCase: true });
});

test("the call to distribution is a call back", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 2, method: "Walk" });
  await frontDesk.getByRole("button", { name: "Call back" }).click();
  const row = cardRow(frontDesk, 1);
  await expect(row.locator(".status")).toHaveText("Called back");
  await expect(row.getByRole("button", { name: "Undo call back" })).toBeVisible();
});

test("parking around the corner is written out", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "Around corner" });
  await expect(cardRow(frontDesk, 1)).toContainText("Around corner");
  await callBack(frontDesk);
  await expect(queueCard(distribution, 1)).toContainText("Around corner");
});

test("the front desk's note stands out on the distribution card", async ({ signIn }) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await openShift(frontDesk);
  await addCard(frontDesk, { familySize: 3, method: "Bus", other: "Needs help to the car" });
  await callBack(frontDesk);
  await expect(queueCard(distribution, 1).locator(".note-from-desk")).toHaveText(
    "Note from the front desk: Needs help to the car",
  );
});
