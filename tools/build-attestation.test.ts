import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Release and Deploy trust an image only if this repository's CI attested it. Naming the CI
// workflow is not enough: a run of it on another branch could attest something else. So every
// check also requires the ref `refs/heads/main` and the commit the image was built from. See
// ADR 0029.

// Each `gh attestation verify` command a workflow runs, with its line continuations joined.
function verifyCommands(file: string): string[] {
  const workflow = parse(readFileSync(file, "utf8")) as {
    jobs: Record<string, { steps?: { run?: string }[] }>;
  };
  return Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .flatMap((step) => (step.run ?? "").replace(/\\\n\s*/g, " ").split("\n"))
    .filter((line) => line.includes('gh attestation verify "oci://'));
}

describe.each([".github/workflows/release.yml", ".github/workflows/deploy.yml"])("%s", (file) => {
  const commands = verifyCommands(file);

  it("checks attestations", () => {
    expect(commands.length).toBeGreaterThan(0);
  });

  it.each(commands)("pins the signer, the ref and the commit: %s", (command) => {
    expect(command).toContain('--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/ci.yml"');
    expect(command).toContain("--source-ref refs/heads/main");
    expect(command).toMatch(/--source-digest "\$(COMMIT|commit)"/);
  });
});
