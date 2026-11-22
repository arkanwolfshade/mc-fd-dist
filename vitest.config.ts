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
        "tools/check-licenses.ts",
        "tools/guides-pdf.ts",
        "tools/deploy-checks.ts",
        "tools/release-checks.ts",
      ],
      // lcov is what Codacy reads; see the upload step in .github/workflows/ci.yml.
      reporter: ["text-summary", "lcov"],
      // A floor of 96%, just below the line coverage Codacy reported (96.77%). Branches sit
      // lower (91.69% when the floor was set), so theirs is just below that. The commit hook
      // and CI's check job both fail under these.
      thresholds: { statements: 96, branches: 91, functions: 96, lines: 96 },
    },
  },
});
