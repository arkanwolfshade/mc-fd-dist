import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import playwrightConfig from "../playwright.config.js";

// CI runs its work in parallel jobs, and the branch ruleset requires one job, `check`, to stand
// for the ones that do not have a rule of their own. A required check that is skipped counts as
// passing, so a gate that waited for a failed job and was skipped would let a broken change
// merge. These tests keep the gate honest as jobs are added or renamed. See ADR 0017.

interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  strategy?: {
    "fail-fast"?: boolean;
    matrix?: { include?: { group: string; projects: string }[] };
  };
  container?: string | { image: string; options?: string };
  steps?: { run?: string; env?: Record<string, string> }[];
}

const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as {
  jobs: Record<string, Job>;
};
const ruleset = JSON.parse(readFileSync(".github/rulesets/pull-requests-need-ci.json", "utf8")) as {
  rules: { type: string; parameters: { required_status_checks: { context: string }[] } }[];
};

const GITHUB_ACTIONS_APP = 15368;
const jobs = Object.entries(workflow.jobs);

// A job by its id, or a clear failure if the workflow no longer has it.
function jobNamed(id: string): Job {
  const found = workflow.jobs[id];
  if (!found) throw new Error(`ci.yml has no job named ${id}`);
  return found;
}

function needsOf(job: Job): string[] {
  return [job.needs ?? []].flat();
}

// The jobs that the ruleset requires by name. The signing check comes from another app.
const required = (ruleset.rules.find((rule) => rule.type === "required_status_checks")?.parameters
  .required_status_checks ?? []) as { context: string; integration_id: number }[];
const requiredJobs = required
  .filter((check) => check.integration_id === GITHUB_ACTIONS_APP)
  .map((check) => check.context);

describe("the CI gate", () => {
  it("has a job for every check the ruleset requires from GitHub Actions", () => {
    expect(requiredJobs.length).toBeGreaterThan(0);
    for (const context of requiredJobs) {
      const names = jobs.map(([id, job]) => job.name ?? id);
      expect(names, `no job is named ${context}`).toContain(context);
    }
  });

  it("is waited for by nothing it could be waiting for itself", () => {
    expect(needsOf(jobNamed("check"))).not.toContain("check");
  });

  it("waits for every job that is not required itself, except the one that publishes", () => {
    const gate = needsOf(jobNamed("check"));
    const unguarded = jobs
      .map(([id]) => id)
      .filter((id) => id !== "publish" && !requiredJobs.includes(id));
    expect(unguarded.length, "the work has not been split into jobs").toBeGreaterThan(0);
    for (const id of unguarded) {
      expect(
        gate,
        `check does not wait for ${id}, so ${id} could fail and nothing would notice`,
      ).toContain(id);
    }
  });

  it("runs even when a job it waits for failed, so that it cannot be skipped into passing", () => {
    const gate = jobNamed("check");
    expect(gate.if).toMatch(/always\(\)/);
  });

  it("fails unless every job it waits for succeeded", () => {
    const gate = jobNamed("check");
    const script = (gate.steps ?? []).map((step) => step.run ?? "").join("\n");
    const env = (gate.steps ?? []).flatMap((step) => Object.values(step.env ?? {})).join("\n");
    for (const id of needsOf(gate)) {
      expect(env, `${id}'s result is not read`).toContain(`needs.${id}.result`);
    }
    expect(script).toMatch(/success/);
  });

  it("is waited for, with the other required jobs, before an image is published", () => {
    const publish = jobNamed("publish");
    for (const context of requiredJobs) {
      expect(needsOf(publish)).toContain(context);
    }
  });
});

describe("the browser tests", () => {
  const e2e = jobNamed("e2e");
  const groups = e2e.strategy?.matrix?.include ?? [];
  const profilesOf = (projects: string) =>
    [...projects.matchAll(/--project=(\S+)/g)].map((match) => match[1]);
  const inGroups = groups.flatMap((group) => profilesOf(group.projects));
  // Every device profile in playwright.config.ts, each of which is a project there, and the
  // browser it runs in. A project that names none runs in Chromium.
  const configured = (playwrightConfig.projects ?? []).map((project) => ({
    name: project.name ?? "",
    browser:
      (project.use as { defaultBrowserType?: string } | undefined)?.defaultBrowserType ??
      "chromium",
  }));
  const profiles = configured.map((project) => project.name);

  it("run as parallel groups, each of which is allowed to finish when another fails", () => {
    expect(groups.length).toBeGreaterThan(1);
    expect(e2e.strategy?.["fail-fast"]).toBe(false);
  });

  it("give each group its own device profiles", () => {
    const script = (e2e.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(script).toContain("${{ matrix.projects }}");
  });

  it("run every device profile in playwright.config.ts, so that none goes untested", () => {
    expect(profiles.length, "no profiles were found in playwright.config.ts").toBeGreaterThan(3);
    for (const profile of profiles) {
      expect(inGroups, `no group runs the ${profile} profile`).toContain(profile);
    }
  });

  it("run each device profile once, and only profiles that exist", () => {
    expect(new Set(inGroups).size, "a profile is in two groups").toBe(inGroups.length);
    for (const name of inGroups) {
      expect(profiles, `${name} is not a profile in playwright.config.ts`).toContain(name);
    }
  });

  // The browsers and their system packages come in Playwright's own image, because installing
  // them on the runner downloads packages from Ubuntu's mirror, which often stalls.
  const image = typeof e2e.container === "string" ? e2e.container : (e2e.container?.image ?? "");
  const pinned =
    /^mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-[a-z]+@sha256:[0-9a-f]{64}$/.exec(image);

  it("run in Playwright's own image, pinned by its digest", () => {
    expect(image, "the browser tests do not run in Playwright's image").not.toBe("");
    expect(
      pinned,
      `${image} is not mcr.microsoft.com/playwright:v<version>-<ubuntu>@sha256:<digest>`,
    ).not.toBeNull();
  });

  it("use the image made for the Playwright version the project installs", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      devDependencies: Record<string, string>;
    };
    // Playwright finds no browsers when the package and the image are different versions.
    expect(pinned?.[1]).toBe(manifest.devDependencies["@playwright/test"]);
  });

  it("install no browsers or system packages of their own", () => {
    const script = (e2e.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(script).not.toMatch(/playwright install|apt-get/);
  });

  it("name the groups' trace files apart, so that one does not overwrite another", () => {
    const text = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(text).toMatch(/name: playwright-traces-\$\{\{ strategy\.job-index \}\}/);
  });
});
