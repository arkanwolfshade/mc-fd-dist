// Checks the deploy workflow runs before releasing.
//
//   tsx tools/deploy-checks.ts window              fails during a shift
//   tsx tools/deploy-checks.ts change-set <file>   fails if a change set replaces or removes anything
import { readFileSync } from "node:fs";
import { unsafeChanges } from "./check-change-set.js";
import { shiftAt } from "./deploy-window.js";

const [command, file] = process.argv.slice(2);

if (command === "window") {
  const shift = shiftAt(new Date());
  if (shift) {
    console.error(`A shift is running (${shift}, Phoenix time). Run again with force to release.`);
    process.exit(1);
  }
  console.log("No shift is running.");
} else if (command === "change-set" && file) {
  const problems = unsafeChanges(JSON.parse(readFileSync(file, "utf8")));
  for (const problem of problems) console.error(`::error title=Stack change refused::${problem}`);
  if (problems.length > 0) {
    console.error("Make this change by hand, after a backup. See docs/developer/operations.md.");
    process.exit(1);
  }
  console.log("The stack changes are all made in place.");
} else {
  console.error("Usage: deploy-checks.ts window | change-set <file>");
  process.exit(2);
}
