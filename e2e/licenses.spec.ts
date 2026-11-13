import { expect, test } from "./fixtures.js";

// The licenses of Preact and the fonts require their notices to travel with the app. See ADR 0026.
test("the app serves the licenses of the libraries and fonts it ships", async ({
  request,
  serverUrl,
}) => {
  const response = await request.get(`${serverUrl}third-party-notices.txt`);
  expect(response.ok()).toBe(true);

  const text = await response.text();
  expect(text).toContain("preact");
  expect(text).toContain("@fontsource/atkinson-hyperlegible-next");
  expect(text).toMatch(/SIL Open Font License/i);
  expect(text).not.toContain("playwright");
});
