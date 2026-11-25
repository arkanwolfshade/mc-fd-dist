import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Whatever a floating tag points to when the server pulls is what runs, including on a rebuilt
// server during a restore. So every image the server runs, except the app's own (which
// release.sh sets by digest through APP_IMAGE), is pinned by digest. See ADR 0029.

const compose = parse(readFileSync("deploy/compose.yaml", "utf8")) as {
  services: Record<string, { image: string }>;
};

const pinned = /^[a-z0-9./-]+:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/;

describe("deploy/compose.yaml", () => {
  const others = Object.entries(compose.services).filter(
    ([, service]) => !service.image.startsWith("${APP_IMAGE"),
  );

  it("runs the app by the image that .env names, and two other images", () => {
    expect(others.map(([name]) => name).sort()).toEqual(["aws", "caddy"]);
  });

  it.each(others)("pins the %s image by version and digest", (_name, service) => {
    expect(service.image).toMatch(pinned);
  });
});
