import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Every image CI publishes carries an SBOM attestation, and a release uses that very document
// as its `sbom.spdx.json`, so the release asset and the image's SBOM can't differ. Deploy does
// not ask for one, so a release cut before this existed can still be deployed (a rollback). The
// SPDX predicate type is what actions/attest records for a Syft SPDX 2.3 document. See ADR 0029.

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string | boolean>;
}

function stepsOf(file: string, job: string): Step[] {
  const workflow = parse(readFileSync(file, "utf8")) as {
    jobs: Record<string, { steps: Step[] }>;
  };
  const found = workflow.jobs[job];
  if (!found) throw new Error(`${file} has no job named ${job}`);
  return found.steps;
}

const SPDX_PREDICATE_TYPE = "https://spdx.dev/Document/v2.3";
const usesAction = (action: string) => (step: Step) => step.uses?.startsWith(`${action}@`) ?? false;

describe("the SBOM of a published image", () => {
  const publish = stepsOf(".github/workflows/ci.yml", "publish");

  it("is generated for the pushed image, by its digest", () => {
    const generate = publish.find(usesAction("anchore/sbom-action"));
    expect(generate?.with?.image).toBe(
      "${{ steps.push.outputs.image }}@${{ steps.push.outputs.digest }}",
    );
    expect(generate?.with?.format).toBe("spdx-json");
    expect(generate?.with?.["output-file"]).toBe("sbom.spdx.json");
  });

  it("is attested to that digest, in the registry, after it is generated", () => {
    const attest = publish.find(
      (step) => usesAction("actions/attest")(step) && step.with?.["sbom-path"],
    );
    expect(attest?.with?.["sbom-path"]).toBe("sbom.spdx.json");
    expect(attest?.with?.["subject-name"]).toBe("${{ steps.push.outputs.image }}");
    expect(attest?.with?.["subject-digest"]).toBe("${{ steps.push.outputs.digest }}");
    expect(attest?.with?.["push-to-registry"]).toBe(true);
    expect(publish.findIndex(usesAction("anchore/sbom-action"))).toBeLessThan(
      publish.indexOf(attest as Step),
    );
  });
});

describe("the SBOM of a release", () => {
  const release = stepsOf(".github/workflows/release.yml", "release");

  it("is the one attested to the image, not a second one generated here", () => {
    expect(release.some(usesAction("anchore/sbom-action"))).toBe(false);
    const take = release.find((step) => step.run?.includes("> sbom.spdx.json") ?? false);
    expect(take?.run).toContain("gh attestation verify");
    expect(take?.run).toContain(`--predicate-type ${SPDX_PREDICATE_TYPE}`);
    expect(take?.run).toContain('--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/ci.yml"');
    // Only a run on main, of the commit being released, may have made the SBOM.
    expect(take?.run).toContain("--source-ref refs/heads/main");
    expect(take?.run).toContain('--source-digest "$COMMIT"');
    expect(take?.run).toContain("verificationResult.statement.predicate");
  });

  it("is published on the release, which is only created after it was taken", () => {
    const taken = release.findIndex((step) => step.run?.includes("> sbom.spdx.json") ?? false);
    const created = release.findIndex((step) => step.run?.includes("gh release create") ?? false);
    expect(taken).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(taken);
    expect(release[created]?.run).toContain("sbom.spdx.json");
  });
});

describe("Deploy", () => {
  it("does not ask for an SBOM, so that an earlier release can still be deployed", () => {
    expect(readFileSync(".github/workflows/deploy.yml", "utf8")).not.toContain("spdx.dev");
  });
});
