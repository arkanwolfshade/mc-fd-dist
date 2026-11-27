import { defineConfig, devices } from "@playwright/test";

// The screens people use at the stations also run on phone and tablet profiles. A new test file
// for one of those screens must be added here. See ADR 0031.
const STATION_TESTS = [
  "accessibility.spec.ts",
  "corrections.spec.ts",
  "device.spec.ts",
  "help.spec.ts",
  "layout.spec.ts",
  "offline.spec.ts",
  "popouts.spec.ts",
  "shift-flow.spec.ts",
  "shift-rules.spec.ts",
];

// Each test starts its own server and database (see e2e/fixtures.ts). The client must
// be built first, which `npm run test:e2e` does.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1100, height: 900 } } },
    { name: "iphone", testMatch: STATION_TESTS, use: { ...devices["iPhone 13"] } },
    {
      name: "iphone-landscape",
      testMatch: STATION_TESTS,
      use: { ...devices["iPhone 13 landscape"] },
    },
    { name: "ipad", testMatch: STATION_TESTS, use: { ...devices["iPad (gen 7)"] } },
    { name: "android", testMatch: STATION_TESTS, use: { ...devices["Pixel 7"] } },
    // The wall display is for a large landscape screen. Desktop also runs it, at its own size.
    {
      name: "wall",
      testMatch: "display.spec.ts",
      use: { viewport: { width: 1920, height: 1080 } },
    },
    // Browser zoom of 200% on a 640 px window shows the page as if 320 px wide (WCAG 1.4.10).
    // The CSS sizes text in px, so enlarging the root font would not test the same thing.
    {
      name: "reflow",
      testMatch: STATION_TESTS,
      use: { ...devices["Pixel 7"], viewport: { width: 320, height: 568 } },
    },
  ],
});
