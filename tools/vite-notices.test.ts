import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildNotices, formatNotices, packageRoot, thirdPartyNotices } from "./vite-notices.js";

describe("packageRoot", () => {
  it("finds the package folder of a module", () => {
    expect(packageRoot("/app/node_modules/preact/dist/preact.module.js")).toBe(
      "/app/node_modules/preact",
    );
  });

  it("keeps the scope of a scoped package", () => {
    expect(packageRoot("/app/node_modules/@fontsource/atkinson/400.css")).toBe(
      "/app/node_modules/@fontsource/atkinson",
    );
  });

  it("uses the innermost node_modules and reads Windows paths", () => {
    expect(packageRoot("C:\\app\\node_modules\\a\\node_modules\\b\\index.js")).toBe(
      "C:/app/node_modules/a/node_modules/b",
    );
  });

  it("ignores a query on the module id", () => {
    expect(packageRoot("/app/node_modules/preact/x.js?inline")).toBe("/app/node_modules/preact");
  });

  it("returns null for the app's own code and virtual modules", () => {
    expect(packageRoot("/app/client/src/main.tsx")).toBeNull();
    expect(packageRoot("\0vite/preload-helper")).toBeNull();
  });
});

describe("formatNotices", () => {
  it("lists each package with its license and the license text", () => {
    const text = formatNotices([
      { name: "preact", version: "11.2.0", license: "MIT", text: "  MIT License text\n\n" },
    ]);
    expect(text).toContain("Third-party notices");
    expect(text).toContain("preact 11.2.0");
    expect(text).toContain("License: MIT");
    expect(text).toContain("MIT License text");
  });
});

describe("buildNotices", () => {
  let dir: string;

  function install(name: string, manifest: object, files: Record<string, string> = {}) {
    const folder = join(dir, "node_modules", name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "package.json"), JSON.stringify({ name, ...manifest }));
    for (const [file, content] of Object.entries(files)) writeFileSync(join(folder, file), content);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mc-notices-"));
    install("preact", { version: "11.2.0", license: "MIT" }, { LICENSE: "Preact license text" });
    install(
      "@fontsource/atkinson",
      { version: "5.3.0", license: "OFL-1.1" },
      { "LICENSE.md": "SIL Open Font License text" },
    );
    install("no-file", { version: "1.0.0", license: "ISC" });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("collects each package that is in the bundle once, in order", async () => {
    const ids = [
      join(dir, "node_modules", "preact", "dist", "a.js"),
      join(dir, "node_modules", "preact", "dist", "b.js"),
      join(dir, "node_modules", "@fontsource", "atkinson", "400.css?inline"),
      join(dir, "client", "src", "main.tsx"),
    ];
    const text = await buildNotices(ids);
    expect(text.match(/preact 11\.2\.0/g)).toHaveLength(1);
    expect(text).toContain("Preact license text");
    expect(text).toContain("@fontsource/atkinson 5.3.0");
    expect(text).toContain("SIL Open Font License text");
    expect(text.indexOf("@fontsource/atkinson")).toBeLessThan(text.indexOf("preact 11"));
    expect(text).not.toContain("main.tsx");
  });

  it("says so when a package ships no license file", async () => {
    const text = await buildNotices([join(dir, "node_modules", "no-file", "index.js")]);
    expect(text).toContain("no-file 1.0.0");
    expect(text).toContain("ships no license file");
  });
});

describe("thirdPartyNotices plugin", () => {
  it("emits the notices file as an asset of the build", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mc-notices-plugin-"));
    const folder = join(dir, "node_modules", "lib");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "package.json"), JSON.stringify({ name: "lib", version: "2.0.0" }));
    writeFileSync(join(folder, "LICENSE"), "Lib license text");

    const emitted: { fileName: string; source: string; type: string }[] = [];
    const context = {
      getModuleIds: () => [join(folder, "index.js")],
      emitFile: (file: (typeof emitted)[number]) => emitted.push(file),
    };
    const hook = thirdPartyNotices().generateBundle as unknown as (
      this: typeof context,
    ) => Promise<void>;
    await hook.call(context);
    rmSync(dir, { recursive: true, force: true });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: "asset", fileName: "third-party-notices.txt" });
    expect(emitted[0]?.source).toContain("Lib license text");
  });
});
