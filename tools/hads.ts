const VALID_TAG = /^\*\*\[(?:SPEC|NOTE|\?)\]\*\*$|^\*\*\[BUG\](?: [^*]+)?\*\*$/;
const LOOKS_LIKE_TAG = /^\**\[(SPEC|NOTE|BUG|\?)\]/;
const VERSION = /\*\*Version \d+\.\d+\.\d+\*\*/;
const INSTRUCTION = /^##\s+AI READING INSTRUCTION\s*$/i;

function endsBlock(line: string): boolean {
  const trimmed = line.trim();
  return (
    LOOKS_LIKE_TAG.test(trimmed) ||
    trimmed.startsWith("## ") ||
    trimmed.startsWith("### ") ||
    trimmed === "---"
  );
}

// Checks a document against HADS 1.0.0 (https://github.com/catcam/hads/blob/main/SPEC.md).
// Unlike the reference validator, it also checks titled [BUG] blocks for a symptom and a fix.
export function checkHads(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const problems: string[] = [];

  const first = lines.findIndex((line) => line.trim() !== "");
  if (!lines[first]?.startsWith("# ")) {
    problems.push(`line ${first + 1}: the document must start with a '# Title' heading`);
  }
  if (!lines.slice(0, 20).some((line) => VERSION.test(line))) {
    problems.push("missing '**Version N.N.N**' in the first 20 lines");
  }

  const sections = lines.filter((line) => line.startsWith("## "));
  const instruction = sections.findIndex((line) => INSTRUCTION.test(line.trim()));
  if (instruction === -1) {
    problems.push("missing the AI READING INSTRUCTION section");
  } else if (instruction > 0) {
    problems.push("the AI READING INSTRUCTION section must come before the first content section");
  }

  let inFence = false;
  lines.forEach((line, index) => {
    // nosemgrep: rules_lgpl_javascript_dos_rule-regex-dos -- reads this repository's own Markdown, and the patterns used here run in linear time
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      return;
    }
    const tag = inFence ? null : LOOKS_LIKE_TAG.exec(trimmed);
    if (!tag) return;

    const where = `line ${index + 1}`;
    if (!VALID_TAG.test(trimmed)) {
      problems.push(
        `${where}: block tags must be bold and alone on their line, like **[${tag[1]}]**`,
      );
      return;
    }
    if ((lines[index + 1] ?? "").trim() === "") {
      problems.push(`${where}: a block tag must be followed immediately by its content`);
    }
    if (tag[1] === "BUG") {
      const rest = lines.slice(index + 1);
      const end = rest.findIndex(endsBlock);
      const block = (end === -1 ? rest : rest.slice(0, end)).map((text) => text.trim());
      for (const field of ["Symptom", "Fix"]) {
        if (!block.some((text) => text.startsWith(`${field}:`))) {
          problems.push(`${where}: the [BUG] block needs a '${field}:' line`);
        }
      }
    }
  });

  return problems;
}
