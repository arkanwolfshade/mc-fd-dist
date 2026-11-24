import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// The Deploy workflow can release to more than one cloud, chosen by its `target` input. A
// mistake here would send a release to the wrong place, let one target's deploy cancel
// another's, or skip the shift-hours guard in production. See ADRs 0029 and 0037.

interface Step {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string | boolean | number>;
}

interface Job {
  needs?: string | string[];
  if?: string;
  environment?: string | { name: string };
  concurrency?: string | { group: string; "cancel-in-progress"?: boolean };
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  steps?: Step[];
}

const text = readFileSync(".github/workflows/deploy.yml", "utf8");
const workflow = parse(text) as {
  on: {
    workflow_dispatch: {
      inputs: Record<string, { type?: string; default?: unknown; options?: string[] }>;
    };
  };
  concurrency?: unknown;
  jobs: Record<string, Job>;
};

function jobNamed(id: string): Job {
  const found = workflow.jobs[id];
  if (!found) throw new Error(`deploy.yml has no job named ${id}`);
  return found;
}

function needsOf(job: Job): string[] {
  return [job.needs ?? []].flat();
}

function environmentOf(job: Job): string | undefined {
  return typeof job.environment === "string" ? job.environment : job.environment?.name;
}

function concurrencyOf(job: Job): string | undefined {
  return typeof job.concurrency === "string" ? job.concurrency : job.concurrency?.group;
}

const target = workflow.on.workflow_dispatch.inputs.target;
const targets = target?.options ?? [];
// Every job other than the one that checks the release deploys to one target.
const targetJobs = Object.keys(workflow.jobs).filter((id) => id !== "verify");

describe("the deploy target", () => {
  it("is chosen from a fixed list, and is AWS unless chosen otherwise", () => {
    expect(target?.type).toBe("choice");
    expect(targets).toContain("aws");
    expect(target?.default).toBe("aws");
  });

  it("has exactly one job for each target, and no job for a target that is not offered", () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect([...targetJobs].sort(byName)).toEqual([...targets].sort(byName));
  });

  it("runs only the chosen target's job", () => {
    for (const id of targetJobs) {
      expect(jobNamed(id).if, `${id} does not check the target`).toBe(`inputs.target == '${id}'`);
    }
  });

  it("is what the Release workflow deploys to when it starts a deploy itself", () => {
    const release = readFileSync(".github/workflows/release.yml", "utf8");
    const dispatch = release
      .split("\n")
      .find((line) => line.includes("gh workflow run deploy.yml"));
    expect(dispatch, "release.yml no longer starts Deploy").toBeDefined();
    const chosen = /--field target=(\S+)/.exec(dispatch ?? "")?.[1];
    expect(chosen ?? target?.default).toBe("aws");
  });
});

describe("the release check", () => {
  it("comes first, and every target deploys only what it checked", () => {
    const verify = jobNamed("verify");
    for (const id of targetJobs) {
      const job = jobNamed(id);
      expect(needsOf(job), `${id} does not wait for the check`).toContain("verify");
      const checkout = (job.steps ?? []).find((step) => step.uses?.startsWith("actions/checkout@"));
      expect(checkout?.with?.ref, `${id} does not deploy the checked commit`).toBe(
        "${{ needs.verify.outputs.commit }}",
      );
    }
    expect(Object.keys(verify.outputs ?? {})).toEqual(
      expect.arrayContaining(["tag", "digest", "commit"]),
    );
  });

  it("needs no approval and no cloud credentials", () => {
    const verify = jobNamed("verify");
    expect(environmentOf(verify)).toBeUndefined();
    expect(verify.permissions?.["id-token"]).toBeUndefined();
  });
});

describe("each target", () => {
  it("is approved in its own environment and queued apart from the others", () => {
    expect(workflow.concurrency, "one queue for the whole workflow mixes the targets").toBe(
      undefined,
    );
    const environments = targetJobs.map((id) => environmentOf(jobNamed(id)));
    const groups = targetJobs.map((id) => concurrencyOf(jobNamed(id)));
    for (const [index, id] of targetJobs.entries()) {
      expect(environments[index], `${id} has no environment`).toBeDefined();
      expect(groups[index], `${id} has no concurrency group`).toBeDefined();
    }
    expect(new Set(environments).size).toBe(targetJobs.length);
    expect(new Set(groups).size).toBe(targetJobs.length);
  });

  it("signs in to its cloud without a stored key", () => {
    expect(text).not.toMatch(/secrets\./);
  });
});

describe("the AWS target", () => {
  it("deploys to production, queued as production deploys always were", () => {
    const aws = jobNamed("aws");
    expect(environmentOf(aws)).toBe("production");
    expect(concurrencyOf(aws)).toBe("deploy-production");
  });

  it("waits for the shift to end unless forced", () => {
    const aws = jobNamed("aws");
    const wait = (aws.steps ?? []).find((step) => step.run?.includes("deploy-checks.ts wait"));
    expect(wait, "the AWS deploy no longer waits for a shift to end").toBeDefined();
    expect(wait?.if).toBe("${{ !inputs.force }}");
  });
});
