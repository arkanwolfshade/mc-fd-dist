import { describe, expect, it } from "vitest";
import { licenseProblems } from "./licenses.js";
import type { InstalledPackage } from "./licenses.js";

const pkg = (name: string, license?: unknown, extra: Partial<InstalledPackage> = {}) => ({
  name,
  version: "1.0.0",
  license,
  ...extra,
});

describe("licenseProblems", () => {
  it("accepts the permissive licenses the project uses", () => {
    const packages = ["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "BlueOak-1.0.0"]
      .concat("OFL-1.1")
      .map((license, index) => pkg(`p${index}`, license));
    expect(licenseProblems(packages)).toEqual([]);
  });

  it("flags copyleft licenses", () => {
    const problems = licenseProblems([
      pkg("a", "GPL-3.0-only"),
      pkg("b", "AGPL-3.0-or-later"),
      pkg("c", "LGPL-2.1"),
    ]);
    expect(problems).toEqual([
      "a@1.0.0: GPL-3.0-only is not on the allowlist",
      "b@1.0.0: AGPL-3.0-or-later is not on the allowlist",
      "c@1.0.0: LGPL-2.1 is not on the allowlist",
    ]);
  });

  it("flags a package that declares no license, or says it is unlicensed", () => {
    expect(licenseProblems([pkg("a"), pkg("b", "UNLICENSED"), pkg("c", "")])).toEqual([
      "a@1.0.0: no license declared",
      "b@1.0.0: UNLICENSED is not on the allowlist",
      "c@1.0.0:  is not on the allowlist",
    ]);
  });

  it("accepts a choice of licenses when one of them is allowed", () => {
    expect(licenseProblems([pkg("a", "(MIT OR GPL-3.0-only)")])).toEqual([]);
    expect(licenseProblems([pkg("b", "GPL-2.0-only OR GPL-3.0-only")])).toHaveLength(1);
  });

  it("needs every license of an AND to be allowed", () => {
    expect(licenseProblems([pkg("a", "(MIT AND GPL-3.0-only)")])).toHaveLength(1);
    expect(licenseProblems([pkg("b", "(MIT AND ISC)")])).toEqual([]);
  });

  it("reads the older object and array forms", () => {
    expect(licenseProblems([pkg("a", { type: "MIT" })])).toEqual([]);
    expect(licenseProblems([pkg("b", undefined, { licenses: [{ type: "MIT" }] })])).toEqual([]);
    expect(
      licenseProblems([pkg("c", undefined, { licenses: [{ type: "GPL-3.0" }] })]),
    ).toHaveLength(1);
  });

  it("allows the named build-time exceptions, but only under the license they carry", () => {
    expect(licenseProblems([pkg("lightningcss", "MPL-2.0")])).toEqual([]);
    expect(licenseProblems([pkg("lightningcss-win32-x64-msvc", "MPL-2.0")])).toEqual([]);
    expect(licenseProblems([pkg("caniuse-lite", "CC-BY-4.0")])).toEqual([]);
    expect(licenseProblems([pkg("lightningcss", "GPL-3.0-only")])).toHaveLength(1);
    expect(licenseProblems([pkg("caniuse-lite", "MPL-2.0")])).toHaveLength(1);
  });

  it("does not let the exceptions cover other packages", () => {
    expect(licenseProblems([pkg("some-other-package", "MPL-2.0")])).toHaveLength(1);
    expect(licenseProblems([pkg("some-other-package", "CC-BY-4.0")])).toHaveLength(1);
  });
});
