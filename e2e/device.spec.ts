import { expect, test } from "./fixtures.js";

// Every station opens its own browser context, so this proves that the device a project
// describes reaches those contexts. Without it the phone and tablet runs would quietly be desktop.
// A touch screen is detected by its coarse pointer, because WebKit reports no touch points even
// when emulating one.
test("a station opens at the size and touch of the device being tested", async ({
  signIn,
}, testInfo) => {
  const page = await signIn("front-desk");
  const { viewport, hasTouch } = testInfo.project.use;
  const actual = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
  }));
  expect({ width: actual.width, height: actual.height }).toEqual(viewport);
  expect(actual.coarsePointer).toBe(Boolean(hasTouch));
});
