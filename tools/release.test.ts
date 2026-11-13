import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";

// release.sh runs on the server, so these run it for real against a stand-in for docker.
// On Windows they need Git's bash; elsewhere they use the system's.
const WINDOWS = process.platform === "win32";
const BASH = WINDOWS ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";
const GIT_TOOLS = "C:\\Program Files\\Git\\usr\\bin";

const IMAGE = "ghcr.io/arkanwolfshade/mc-fd-dist";
const VERSION = "v0.2.0";
const RELEASED = `sha256:${"a".repeat(64)}`;
const PREVIOUS = `${IMAGE}@sha256:${"b".repeat(64)}`;
// What the server runs today: an image named by its commit tag, from before releases.
const BEFORE_RELEASES = `${IMAGE}:${"c".repeat(40)}`;

// `compose up` fails for an image whose name ends with FAILING, as it does when the app
// never becomes healthy, because Caddy waits for it. Everything else succeeds.
const DOCKER = `#!/usr/bin/env bash
case "$1 $2" in
  "compose up")
    if grep -q "^APP_IMAGE=.*[:@]$FAILING$" .env; then
      echo "dependency failed to start: container mc-fd-dist-app-1 is unhealthy" >&2
      exit 1
    fi ;;
  "compose ps") case "$*" in *--status*) ;; *) echo container-id ;; esac ;;
  "inspect "*) echo healthy ;;
esac
`;

// Every path written here is inside the temporary folder this test has just made, and none comes
// from outside it.
function put(path: string, text: string) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths are in the test's own temp folder
  writeFileSync(path, text);
}

interface Run {
  failing: string;
  previous?: string;
  version?: string;
  digest?: string;
}

function release({ failing, previous = PREVIOUS, version = VERSION, digest = RELEASED }: Run) {
  const dir = mkdtempSync(join(tmpdir(), "release-")).replaceAll("\\", "/");
  const bin = `${dir}/bin`;
  mkdirSync(bin);
  put(`${bin}/docker`, DOCKER);
  chmodSync(`${bin}/docker`, 0o755);
  copyFileSync("deploy/release.sh", `${dir}/release.sh`);
  put(`${dir}/.env`, `APP_IMAGE=${previous}\n`);
  // Left by a release made before versions.
  put(`${dir}/release-commit`, `${"c".repeat(40)}\n`);

  const path = [bin, WINDOWS ? GIT_TOOLS : "", process.env.PATH ?? ""]
    .filter(Boolean)
    .join(delimiter);
  const result = spawnSync(BASH, [`${dir}/release.sh`, version, digest], {
    cwd: dir,
    env: { ...process.env, PATH: path, FAILING: failing },
    encoding: "utf8",
  });
  const read = (file: string) =>
    existsSync(`${dir}/${file}`) ? readFileSync(`${dir}/${file}`, "utf8").trim() : undefined;
  return {
    ...result,
    env: read(".env"),
    releaseVersion: read("release-version"),
    releaseCommit: read("release-commit"),
  };
}

describe.skipIf(WINDOWS && !existsSync(BASH))("release.sh", () => {
  it("records the release when the new image comes up healthy", () => {
    const result = release({ failing: "no-such-image" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Released ${VERSION}`);
    expect(result.releaseVersion).toBe(`${VERSION} ${RELEASED}`);
    expect(result.env).toBe(`APP_IMAGE=${IMAGE}@${RELEASED}`);
  });

  it("runs the image by its digest and drops the record of the old commit-based release", () => {
    const result = release({ failing: "no-such-image" });
    expect(result.env).toContain(`@${RELEASED}`);
    expect(result.releaseCommit).toBeUndefined();
  });

  it("goes back to the previous image when the new one cannot start", () => {
    const result = release({ failing: RELEASED });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Going back to");
    expect(result.env).toBe(`APP_IMAGE=${PREVIOUS}`);
    expect(result.releaseVersion).toBeUndefined();
  });

  it("goes back to an image named by a commit tag, which is what runs before the first release", () => {
    const result = release({ failing: RELEASED, previous: BEFORE_RELEASES });
    expect(result.status).toBe(1);
    expect(result.env).toBe(`APP_IMAGE=${BEFORE_RELEASES}`);
  });

  it("says so when the previous image cannot start either", () => {
    const result = release({ failing: "[0-9a-f]*" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("The previous image is not healthy either");
  });

  it.each([
    ["a version without the v", { version: "0.2.0" }],
    ["a version that is not three numbers", { version: "v0.2" }],
    ["a version with a leading zero", { version: "v01.2.0" }],
    ["a digest that is too short", { digest: "sha256:abc" }],
    ["a digest of another kind", { digest: `sha512:${"a".repeat(64)}` }],
    ["a tag in place of a digest", { digest: "latest" }],
  ])("refuses %s before touching anything", (_name, change) => {
    const result = release({ failing: "no-such-image", ...change });
    expect(result.status).toBe(2);
    expect(result.env).toBe(`APP_IMAGE=${PREVIOUS}`);
    expect(result.releaseVersion).toBeUndefined();
  });
});
