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

const PREVIOUS = "b".repeat(40);
const RELEASED = "a".repeat(40);
const IMAGE = "ghcr.io/arkanwolfshade/mc-fd-dist";

// `compose up` fails for an image whose tag matches FAILING_TAG, as it does when the app
// never becomes healthy, because Caddy waits for it. Everything else succeeds.
const DOCKER = `#!/usr/bin/env bash
case "$1 $2" in
  "compose up")
    if grep -q "^APP_IMAGE=.*:$FAILING_TAG$" .env; then
      echo "dependency failed to start: container mc-fd-dist-app-1 is unhealthy" >&2
      exit 1
    fi ;;
  "compose ps") case "$*" in *--status*) ;; *) echo container-id ;; esac ;;
  "inspect "*) echo healthy ;;
esac
`;

function release(failingTag: string) {
  const dir = mkdtempSync(join(tmpdir(), "release-")).replaceAll("\\", "/");
  const bin = `${dir}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/docker`, DOCKER);
  chmodSync(`${bin}/docker`, 0o755);
  copyFileSync("deploy/release.sh", `${dir}/release.sh`);
  writeFileSync(`${dir}/.env`, `APP_IMAGE=${IMAGE}:${PREVIOUS}\n`);

  const path = [bin, WINDOWS ? GIT_TOOLS : "", process.env.PATH ?? ""]
    .filter(Boolean)
    .join(delimiter);
  const result = spawnSync(BASH, [`${dir}/release.sh`, RELEASED], {
    cwd: dir,
    env: { ...process.env, PATH: path, FAILING_TAG: failingTag },
    encoding: "utf8",
  });
  const read = (file: string) =>
    existsSync(`${dir}/${file}`) ? readFileSync(`${dir}/${file}`, "utf8").trim() : undefined;
  return { ...result, env: read(".env"), releaseCommit: read("release-commit") };
}

describe.skipIf(WINDOWS && !existsSync(BASH))("release.sh", () => {
  it("records the release when the new image comes up healthy", () => {
    const result = release("no-such-tag");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Released ${RELEASED}`);
    expect(result.releaseCommit).toBe(RELEASED);
    expect(result.env).toBe(`APP_IMAGE=${IMAGE}:${RELEASED}`);
  });

  it("goes back to the previous image when the new one cannot start", () => {
    const result = release(RELEASED);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Going back to");
    expect(result.env).toBe(`APP_IMAGE=${IMAGE}:${PREVIOUS}`);
    expect(result.releaseCommit).toBeUndefined();
  });

  it("says so when the previous image cannot start either", () => {
    const result = release("[0-9a-f]*");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("The previous image is not healthy either");
  });
});
