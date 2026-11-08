import { describe, expect, it } from "vitest";
import { checkHads } from "./hads.js";

const VALID = `# A guide
**Version 1.0.0** · Author · 2026-11-08

---

## AI READING INSTRUCTION

Read \`[SPEC]\` and \`[BUG]\` blocks for authoritative facts.

---

## 1. Section

**[SPEC]**
- A fact.

**[NOTE]**
Some context.

**[BUG] Something breaks**
Symptom: It breaks.
Cause: A reason.
Fix: Do this.

**[?]**
- Not checked yet.

\`\`\`markdown
[SPEC] inside a code block is only an example
\`\`\`
`;

describe("checkHads", () => {
  it("accepts a valid document", () => {
    expect(checkHads(VALID)).toEqual([]);
  });

  it("requires a title first", () => {
    expect(checkHads(VALID.replace("# A guide", "A guide"))).toContain(
      "line 1: the document must start with a '# Title' heading",
    );
  });

  it("requires a version near the top", () => {
    expect(checkHads(VALID.replace("**Version 1.0.0**", "Version one"))).toContain(
      "missing '**Version N.N.N**' in the first 20 lines",
    );
  });

  it("requires the AI reading instruction before the first section", () => {
    const moved = VALID.replace("## AI READING INSTRUCTION", "## Reading").replace(
      "## 1. Section",
      "## AI READING INSTRUCTION\n\n## 1. Section",
    );
    expect(checkHads(moved)).toContain(
      "the AI READING INSTRUCTION section must come before the first content section",
    );
    expect(checkHads(VALID.replace("## AI READING INSTRUCTION", "## Reading"))).toContain(
      "missing the AI READING INSTRUCTION section",
    );
  });

  it("rejects tags that are not bold on their own line", () => {
    expect(checkHads(VALID.replace("**[NOTE]**", "[NOTE]"))).toContain(
      "line 17: block tags must be bold and alone on their line, like **[NOTE]**",
    );
    expect(checkHads(VALID.replace("**[NOTE]**", "**[NOTE]** Some context."))).toContain(
      "line 17: block tags must be bold and alone on their line, like **[NOTE]**",
    );
  });

  it("rejects a tag with nothing straight after it", () => {
    expect(checkHads(VALID.replace("**[SPEC]**\n", "**[SPEC]**\n\n"))).toContain(
      "line 14: a block tag must be followed immediately by its content",
    );
  });

  it("requires a symptom and a fix in every known problem", () => {
    expect(checkHads(VALID.replace("Symptom: It breaks.\n", ""))).toContain(
      "line 20: the [BUG] block needs a 'Symptom:' line",
    );
    expect(checkHads(VALID.replace("Fix: Do this.\n", ""))).toContain(
      "line 20: the [BUG] block needs a 'Fix:' line",
    );
  });
});
