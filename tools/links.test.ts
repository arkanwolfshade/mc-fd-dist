import { describe, expect, it } from "vitest";
import { localTargets } from "./links.js";

describe("localTargets", () => {
  it("lists local links and pictures, without anchors", () => {
    const markdown =
      "See [the guide](front-desk.md#2-entering-a-family) and ![a screen](../images/screen.png).";
    expect(localTargets(markdown)).toEqual(["front-desk.md", "../images/screen.png"]);
  });

  it("skips web addresses, email links and links within the page", () => {
    const markdown =
      "[site](https://example.org) [mail](mailto:a@example.org) [section](#section) [plain](http://x)";
    expect(localTargets(markdown)).toEqual([]);
  });

  it("ignores links inside code", () => {
    const markdown =
      "```markdown\n![example](images/missing.png)\n```\nAnd `[x](missing.md)` inline.";
    expect(localTargets(markdown)).toEqual([]);
  });
});
