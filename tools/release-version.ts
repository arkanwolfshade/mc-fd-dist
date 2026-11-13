// The rules for naming a release and the image it runs. Pure, so that they can be tested; the
// Release and Deploy workflows reach them through tools/release-checks.ts.

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

// Three plain numbers, as in SemVer without pre-release or build parts, with an optional "v".
const VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export function parseVersion(text: string): Version | undefined {
  const match = VERSION.exec(text);
  if (!match) return undefined;
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  if (![major, minor, patch].every(Number.isSafeInteger)) return undefined;
  return { major, minor, patch };
}

// The tag name for a version: always with the "v".
export function formatVersion(version: Version): string {
  return `v${version.major}.${version.minor}.${version.patch}`;
}

// Negative when a is older than b, positive when newer, zero when the same.
export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

// The highest version among a repository's tags. Tags that are not versions are ignored.
export function highestVersion(tags: string[]): Version | undefined {
  const versions = tags.flatMap((tag) => parseVersion(tag) ?? []);
  return versions.sort(compareVersions).at(-1);
}

// What is wrong with releasing this version, given the tags that already exist. A release's tag
// can never be reused, even if the release is deleted, so a mistake here cannot be undone.
export function versionProblems(input: string, existingTags: string[]): string[] {
  const version = parseVersion(input);
  if (!version) return [`${input} is not a version like 0.2.0`];
  const tag = formatVersion(version);
  const highest = highestVersion(existingTags);
  const taken = existingTags.flatMap((existing) => parseVersion(existing) ?? []);
  if (taken.some((existing) => compareVersions(existing, version) === 0)) {
    return [`${tag} already exists`];
  }
  if (highest && compareVersions(version, highest) < 0) {
    return [`${tag} must be newer than ${formatVersion(highest)}`];
  }
  return [];
}

export function isImageDigest(text: string): boolean {
  return DIGEST.test(text);
}

// The image a release runs: named by its digest, which no one can move, unlike a tag.
export function imageReference(repository: string, digest: string): string {
  if (!isImageDigest(digest)) throw new Error(`${digest} is not an image digest`);
  return `ghcr.io/${repository.toLowerCase()}@${digest}`;
}
