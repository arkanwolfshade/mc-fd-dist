import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guides } from "./vite-guides.js";

type Load = (this: { addWatchFile: (file: string) => void }, id: string) => Promise<string | null>;

describe("guides plugin", () => {
  let dir: string;
  const watched: string[] = [];
  const load = guides().load as unknown as Load;
  const context = { addWatchFile: (file: string) => watched.push(file) };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mc-guides-"));
    mkdirSync(join(dir, "images"));
    writeFileSync(join(dir, "images", "screen.png"), "");
    writeFileSync(
      join(dir, "guide.md"),
      "# A guide\n**Version 1.0.0**\n\n**[SPEC]**\n- A step.\n\n![A screen](images/screen.png)\n",
    );
    watched.length = 0;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves other files to Vite", async () => {
    expect(await load.call(context, join(dir, "guide.md"))).toBeNull();
  });

  it("turns a guide into HTML whose pictures are imported as assets", async () => {
    const code = await load.call(context, `${join(dir, "guide.md")}?guide`);

    expect(code).toContain(
      `import picture0 from ${JSON.stringify(join(dir, "images", "screen.png"))};`,
    );
    expect(code).toContain('.replaceAll("__GUIDE_PICTURE_0__", picture0)');
    expect(code).toContain("<h1>A guide</h1>");
    expect(code).not.toContain("[SPEC]");
  });

  it("rebuilds when the guide changes", async () => {
    await load.call(context, `${join(dir, "guide.md")}?guide`);
    expect(watched).toEqual([join(dir, "guide.md")]);
  });
});
