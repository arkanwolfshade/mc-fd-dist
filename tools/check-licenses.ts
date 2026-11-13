// Checks that the license of every installed package is on the allowlist in licenses.ts, so
// that a dependency update cannot quietly bring in a copyleft or unlicensed package. See ADR 0026.
//
//   npm run licenses:check
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { licenseProblems } from "./licenses.js";
import type { InstalledPackage } from "./licenses.js";

function packagesIn(folder: string): InstalledPackage[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || entry.name.startsWith(".")) return [];
    const path = join(folder, entry.name);
    if (entry.name.startsWith("@")) return packagesIn(path);
    const manifest = join(path, "package.json");
    const nested = join(path, "node_modules");
    return [
      ...(existsSync(manifest)
        ? [JSON.parse(readFileSync(manifest, "utf8")) as InstalledPackage]
        : []),
      ...(existsSync(nested) ? packagesIn(nested) : []),
    ];
  });
}

const packages = packagesIn("node_modules");
const problems = licenseProblems(packages);

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`License checks passed (${packages.length} packages).`);
