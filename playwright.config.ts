import { defineConfig } from "@playwright/test";

// Each test starts its own server and database (see e2e/fixtures.ts). The client must
// be built first, which `npm run test:e2e` does.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    viewport: { width: 1100, height: 900 },
    trace: "retain-on-failure",
  },
});
