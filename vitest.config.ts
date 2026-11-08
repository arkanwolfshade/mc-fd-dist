import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is the client folder.
export default defineConfig({
  test: {
    include: ["server/**/*.test.ts", "client/**/*.test.ts", "tools/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // The screens, the server's entry point and the command-line tools are covered by
      // the browser tests, the container smoke test and CI's documentation steps, which this
      // does not measure.
      include: ["server/**/*.ts", "client/src/**/*.ts", "tools/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "server/test-support.ts",
        "server/main.ts",
        "server/cli/**",
        "tools/check-docs.ts",
        "tools/guides-pdf.ts",
        "tools/deploy-checks.ts",
      ],
      reporter: ["text-summary"],
      // Set just below the level when coverage was first measured, so it cannot fall.
      thresholds: { statements: 92, branches: 84, functions: 93, lines: 92 },
    },
  },
});
