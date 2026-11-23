import { expect, test } from "@playwright/test";

// Deliberately fails, to show that a failing browser test group turns the required check red.
// This file is not in STATION_TESTS, so it runs only in the desktop group. Never merge it.
test("deliberately fails to prove that the CI gate blocks a failing group", () => {
  expect(true).toBe(false);
});
