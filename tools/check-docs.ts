// Checks the documentation:
// - the guides and developer docs follow HADS;
// - every link and picture in any Markdown file points at a file that exists;
// - every guide picture is used somewhere.
//
//   npm run docs:check
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { checkHads } from "./hads.js";
import { localTargets } from "./links.js";

const HADS_FOLDERS = ["docs/guides", "docs/developer"];
const SKIP = new Set([
  "node_modules",
  "dist",
  ".git",
  "test-results",
  "playwright-report",
  "coverage",
]);
const PICTURES = "docs/guides/images";

function markdownFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

const problems: string[] = [];
const used = new Set<string>();

for (const file of markdownFiles(".")) {
  const name = relative(".", file).replaceAll("\\", "/");
  const markdown = readFileSync(file, "utf8");

  if (HADS_FOLDERS.some((folder) => name.startsWith(`${folder}/`))) {
    for (const problem of checkHads(markdown)) problems.push(`${name}: ${problem}`);
  }
  for (const target of localTargets(markdown)) {
    const path = resolve(dirname(file), target);
    used.add(path);
    if (!existsSync(path)) problems.push(`${name}: links to ${target}, which does not exist`);
  }
}

for (const picture of readdirSync(PICTURES)) {
  if (!used.has(resolve(PICTURES, picture))) {
    problems.push(`${PICTURES}/${picture} is not used in any document`);
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Documentation checks passed.");
