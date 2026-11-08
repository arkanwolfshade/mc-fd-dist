import { describe, expect, it } from "vitest";
import { forReaders, guideToHtml } from "./guides.js";

const SOURCE = `# Front desk guide
**Version 1.0.0** · mc-fd-dist · 2026-11-08

---

## AI READING INSTRUCTION

Read \`[SPEC]\` and \`[BUG]\` blocks for authoritative facts.
Read \`[NOTE]\` only if additional context is needed.

---

## 1. Entering a card

**[SPEC]**
- Type the number of people.

**[NOTE]**
Most families come by car.

**[?]**
- Card numbers may go above 200.

**[BUG] The Save card button does nothing**
Symptom: Nothing happens when you tap Save card.
Cause: No arrival method was chosen.
Fix: Tap how the family arrived, then Save card.

![The new card form](images/new-card.png)
`;

describe("forReaders", () => {
  const text = forReaders(SOURCE);

  it("keeps the title, version and content", () => {
    expect(text).toContain("# Front desk guide");
    expect(text).toContain("**Version 1.0.0**");
    expect(text).toContain("- Type the number of people.");
    expect(text).toContain("Most families come by car.");
  });

  it("removes the AI reading instruction", () => {
    expect(text).not.toContain("AI READING INSTRUCTION");
    expect(text).not.toContain("authoritative facts");
  });

  it("removes the block tags", () => {
    for (const tag of ["[SPEC]", "[NOTE]", "[?]", "[BUG]"]) {
      expect(text).not.toContain(tag);
    }
  });

  it("turns a known problem into plain steps", () => {
    expect(text).toContain("**Problem: The Save card button does nothing**");
    expect(text).toContain("- **What you see:** Nothing happens when you tap Save card.");
    expect(text).toContain("- **Why:** No arrival method was chosen.");
    expect(text).toContain("- **What to do:** Tap how the family arrived, then Save card.");
  });
});

describe("guideToHtml", () => {
  it("renders the guide for readers", () => {
    const html = guideToHtml(SOURCE, (src) => src);
    expect(html).toContain("<h1>Front desk guide</h1>");
    expect(html).not.toContain("[SPEC]");
  });

  it("lets the caller decide where each picture comes from", () => {
    const html = guideToHtml(SOURCE, (src) => `/assets/${src.replace("images/", "")}`);
    expect(html).toContain('src="/assets/new-card.png"');
    expect(html).toContain('alt="The new card form"');
  });
});
