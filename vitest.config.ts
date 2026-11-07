import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is the client folder.
export default defineConfig({
  test: {
    include: ["server/**/*.test.ts", "client/**/*.test.ts"],
  },
});
