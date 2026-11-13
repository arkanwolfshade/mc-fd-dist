// Checks the deploy workflow runs before releasing.
//
//   tsx tools/deploy-checks.ts wait                waits for a running shift to end, or fails at
//                                                  once if that is more than a job can wait
//   tsx tools/deploy-checks.ts change-set <file>   fails if a change set replaces or removes anything
import { readFileSync } from "node:fs";
import { unsafeChanges } from "./check-change-set.js";
import { phoenixClock, waitForWindow } from "./deploy-window.js";

// A job may run 6 hours; the rest of the 360 minutes is for checkout, install and the release.
const MAX_WAIT_MS = 340 * 60_000;

const [command, file] = process.argv.slice(2);

if (command === "wait") {
  const result = await waitForWindow({
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => {
      process.stdout.write(`${line}
`);
    },
    maxWaitMs: MAX_WAIT_MS,
  });
  if (result.status === "too-far") {
    const again = new Date(result.opensAt.getTime() - MAX_WAIT_MS);
    console.error(
      `::error title=Window too far away::The window opens at ${phoenixClock(result.opensAt)} Phoenix time, ` +
        `longer than a job can wait. Approve again after ${phoenixClock(again)}, or run Deploy by hand with force.`,
    );
    process.exit(1);
  }
  console.log("The window is open.");
} else if (command === "change-set" && file) {
  const problems = unsafeChanges(JSON.parse(readFileSync(file, "utf8")));
  for (const problem of problems) console.error(`::error title=Stack change refused::${problem}`);
  if (problems.length > 0) {
    console.error("Make this change by hand, after a backup. See docs/developer/operations.md.");
    process.exit(1);
  }
  console.log("The stack changes are all made in place.");
} else {
  console.error("Usage: deploy-checks.ts wait | change-set FILE");
  process.exit(2);
}
