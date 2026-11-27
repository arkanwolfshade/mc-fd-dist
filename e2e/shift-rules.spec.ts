import { expect, test } from "./fixtures.js";

// One shift is open at a time, and it closes only when no card is still waiting. A shift left
// open overnight is finished on the stations before the day's shift opens. See ADR 0040.

function isoDay(daysAgo: number): string {
  const day = new Date();
  day.setDate(day.getDate() - daysAgo);
  return [day.getFullYear(), day.getMonth() + 1, day.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

test("yesterday's shift still open is finished before today's opens", async ({
  signIn,
  serverUrl,
}) => {
  const frontDesk = await signIn("front-desk");
  const distribution = await signIn("distribution");
  await expect(frontDesk.getByRole("button", { name: "Open today's shift" })).toBeVisible();

  // Yesterday's shift, left open with a Family still waiting, as the overnight close leaves it.
  const yesterday = await frontDesk.request.post(`${serverUrl}api/shifts`, {
    data: { date: isoDay(1) },
  });
  const shift = await yesterday.json();
  await frontDesk.request.post(`${serverUrl}api/shifts/${shift.id}/cards`, {
    data: {
      clientId: crypto.randomUUID(),
      number: 7,
      familySize: 3,
      arrivalMethod: "Walk",
      intakeInitials: "AB",
    },
  });

  // Today's can't open while it is, so both stations show yesterday's with a red banner. The
  // front desk gets no form, so today's Families can't go into yesterday's shift.
  for (const station of [frontDesk, distribution]) {
    await station.reload();
    await expect(station.locator(".shift-banner")).toContainText("shift is still open");
  }
  await expect(frontDesk.getByRole("heading", { name: "New card" })).toHaveCount(0);
  await expect(frontDesk.getByRole("button", { name: "Open today's shift" })).toHaveCount(0);

  // Distribution resolves the waiting card, then closes the shift.
  await distribution.getByRole("button", { name: "Close shift" }).click();
  const finish = distribution.locator(".confirm");
  await expect(finish.locator(".stop")).toContainText("Card 7 is still waiting");
  await finish.getByRole("button", { name: "Left without food" }).click();
  await finish.getByRole("button", { name: "Yes, left without food" }).click();
  await finish.getByRole("button", { name: "Yes, close the shift" }).click();

  // Every station can now open today's shift.
  for (const station of [frontDesk, distribution]) {
    await expect(station.getByRole("button", { name: "Open today's shift" })).toBeVisible();
  }
  await frontDesk.getByRole("button", { name: "Open today's shift" }).click();
  await expect(frontDesk.getByRole("heading", { name: "New card" })).toBeVisible();
  await expect(frontDesk.locator(".shift-banner")).toHaveCount(0);
});
