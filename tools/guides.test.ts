import { describe, expect, it } from "vitest";
import { forReaders, guideToHtml, helpTopics } from "./guides.js";

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

const MARKED = `# Guide

**[SPEC]**
1. **Card #**: the ticket shows the number. <!-- help:card-number -->
2. A line no popout wants.
- Weigh each cart. <!-- help:serving -->
  - A detail under it. <!-- help:serving -->
A paragraph on its own. <!-- help:other -->
3. Tick the extras. <!-- help:serving -->
`;

describe("helpTopics", () => {
  const topics = helpTopics(MARKED);

  it("gives each topic its marked lines, in order, and no others", () => {
    expect(Object.keys(topics)).toEqual(["card-number", "serving", "other"]);
    expect(topics.serving).toMatch(/Weigh each cart\.[\s\S]*A detail under it[\s\S]*Tick the/);
    expect(JSON.stringify(topics)).not.toContain("no popout wants");
  });

  it("drops the step numbers and the markers", () => {
    expect(topics["card-number"]).toContain(
      "<li><strong>Card #</strong>: the ticket shows the number.</li>",
    );
    expect(topics["card-number"]).not.toContain("<ol");
    expect(JSON.stringify(topics)).not.toContain("help:");
  });

  it("keeps a nested line nested, and a plain line a paragraph", () => {
    expect(topics.serving).toMatch(/Weigh each cart\.\s*<ul>\s*<li>A detail under it\./);
    expect(topics.other).toBe("<p>A paragraph on its own.</p>\n");
  });

  it("starts a new paragraph for a plain line that follows a list", () => {
    const html = helpTopics("- A step. <!-- help:a -->\nA note. <!-- help:a -->\n").a;
    expect(html).toContain("<p>A note.</p>");
  });

  it("is empty for a guide with no markers", () => {
    expect(helpTopics(SOURCE)).toEqual({});
  });

  it("leaves no marker in what readers see", () => {
    expect(forReaders(MARKED)).not.toContain("help:");
    expect(forReaders(MARKED)).toContain("2. A line no popout wants.");
  });
});
