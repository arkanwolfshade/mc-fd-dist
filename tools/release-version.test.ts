import { describe, expect, it } from "vitest";
import {
  compareVersions,
  highestVersion,
  imageReference,
  isImageDigest,
  parseVersion,
  versionProblems,
} from "./release-version.js";

const DIGEST = `sha256:${"a1".repeat(32)}`;

describe("parseVersion", () => {
  it("reads a version with or without the leading v", () => {
    expect(parseVersion("0.2.0")).toEqual({ major: 0, minor: 2, patch: 0 });
    expect(parseVersion("v1.12.3")).toEqual({ major: 1, minor: 12, patch: 3 });
  });

  it.each([
    "",
    "1",
    "1.2",
    "1.2.3.4",
    "1.2.x",
    "1.2.3-rc1",
    "1.2.3+build",
    "V1.2.3",
    " 1.2.3",
    "v 1.2.3",
  ])("refuses %j, which is not three plain numbers", (text) => {
    expect(parseVersion(text)).toBeUndefined();
  });

  it("refuses numbers with leading zeros, which SemVer does not allow", () => {
    expect(parseVersion("01.2.3")).toBeUndefined();
    expect(parseVersion("1.02.3")).toBeUndefined();
  });
});

describe("compareVersions", () => {
  const v = (text: string) => parseVersion(text)!;

  it("orders by major, then minor, then patch, as numbers", () => {
    expect(compareVersions(v("1.0.0"), v("0.9.9"))).toBeGreaterThan(0);
    expect(compareVersions(v("0.2.0"), v("0.10.0"))).toBeLessThan(0);
    expect(compareVersions(v("0.1.2"), v("0.1.10"))).toBeLessThan(0);
    expect(compareVersions(v("0.1.0"), v("v0.1.0"))).toBe(0);
  });
});

describe("highestVersion", () => {
  it("finds the highest version tag and ignores tags that are not versions", () => {
    expect(
      highestVersion(["v0.1.0", "v0.10.0", "v0.2.0", "latest", "backup-2026", "v1.0.0-rc1"]),
    ).toEqual({
      major: 0,
      minor: 10,
      patch: 0,
    });
  });

  it("is undefined when there is no version tag", () => {
    expect(highestVersion([])).toBeUndefined();
    expect(highestVersion(["latest"])).toBeUndefined();
  });
});

describe("versionProblems", () => {
  it("accepts the first release when there are no version tags", () => {
    expect(versionProblems("0.1.0", [])).toEqual([]);
    expect(versionProblems("0.1.0", ["latest"])).toEqual([]);
  });

  it("accepts a version newer than every existing one", () => {
    expect(versionProblems("0.3.0", ["v0.1.0", "v0.2.0"])).toEqual([]);
    expect(versionProblems("v1.0.0", ["v0.9.0"])).toEqual([]);
  });

  it("names a version that is not three numbers", () => {
    expect(versionProblems("1.2", [])).toEqual(["1.2 is not a version like 0.2.0"]);
  });

  it("refuses a version that already exists, in either spelling", () => {
    expect(versionProblems("0.2.0", ["v0.1.0", "v0.2.0"])).toEqual(["v0.2.0 already exists"]);
    expect(versionProblems("v0.2.0", ["v0.2.0"])).toEqual(["v0.2.0 already exists"]);
  });

  it("refuses a version that is not newer than the highest one", () => {
    expect(versionProblems("0.1.5", ["v0.1.0", "v0.2.0"])).toEqual([
      "v0.1.5 must be newer than v0.2.0",
    ]);
  });
});

describe("isImageDigest", () => {
  it("accepts sha256 and 64 lower-case hex digits, and nothing else", () => {
    expect(isImageDigest(DIGEST)).toBe(true);
    expect(isImageDigest(DIGEST.toUpperCase())).toBe(false);
    expect(isImageDigest(DIGEST.slice(0, -1))).toBe(false);
    expect(isImageDigest(`${DIGEST}a`)).toBe(false);
    expect(isImageDigest(`sha512:${"a1".repeat(32)}`)).toBe(false);
    expect(isImageDigest(`${DIGEST}\nextra`)).toBe(false);
    expect(isImageDigest("")).toBe(false);
  });
});

describe("imageReference", () => {
  it("names the image by its digest", () => {
    expect(imageReference("arkanwolfshade/mc-fd-dist", DIGEST)).toBe(
      `ghcr.io/arkanwolfshade/mc-fd-dist@${DIGEST}`,
    );
  });

  it("lower-cases the repository, as the registry does", () => {
    expect(imageReference("ArkanWolfshade/MC-FD-Dist", DIGEST)).toBe(
      `ghcr.io/arkanwolfshade/mc-fd-dist@${DIGEST}`,
    );
  });

  it("refuses a digest that is not one", () => {
    expect(() => imageReference("arkanwolfshade/mc-fd-dist", "latest")).toThrow(
      "not an image digest",
    );
  });
});
