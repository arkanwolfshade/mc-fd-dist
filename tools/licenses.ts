export interface InstalledPackage {
  name: string;
  version: string;
  license?: unknown;
  licenses?: unknown;
}

// Permissive licenses the project can use and ship without conditions beyond keeping notices.
const ALLOWED = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "OFL-1.1",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
]);

// Build tools and build-time data, which are not shipped. They are named, and only under the
// license they carry, so a new package under the same license, or a changed license, is still
// flagged. shortcut: lightningcss is a build tool; revisit if it is ever bundled into the app.
function isException(name: string, license: string): boolean {
  if (name === "caniuse-lite") return license === "CC-BY-4.0";
  return (name === "lightningcss" || name.startsWith("lightningcss-")) && license === "MPL-2.0";
}

// The license a package declares, as an SPDX expression. The old `licenses` array is a choice.
function declared(pkg: InstalledPackage): string | null {
  const one = pkg.license;
  if (typeof one === "string") return one;
  if (one !== null && typeof one === "object") return String((one as { type?: unknown }).type);
  if (!Array.isArray(pkg.licenses)) return null;
  const types = (pkg.licenses as { type?: unknown }[]).map((entry) => String(entry.type));
  return types.length > 0 ? types.join(" OR ") : null;
}

// "(MIT OR Apache-2.0)" is fine if either is allowed; "A AND B" only if both are. SPDX writes
// the operators with single spaces, so plain string splits are enough, and an oddly spaced
// expression is rejected, never accepted.
// shortcut: nested expressions are read loosely, which can only reject a good one, never
// accept a bad one; spell out the license in the allowlist if that ever happens.
function permitted(expression: string): boolean {
  return expression.split(" OR ").some((choice) =>
    choice
      .replace(/[()]/g, "")
      .split(" AND ")
      .every((id) => ALLOWED.has(id.trim())),
  );
}

export function licenseProblems(packages: InstalledPackage[]): string[] {
  return packages.flatMap((pkg) => {
    const license = declared(pkg);
    if (license === null) return [`${pkg.name}@${pkg.version}: no license declared`];
    if (permitted(license) || isException(pkg.name, license)) return [];
    return [`${pkg.name}@${pkg.version}: ${license} is not on the allowlist`];
  });
}
