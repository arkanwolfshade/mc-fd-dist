import { Marked } from "marked";

const PLAIN_TAG = /^\*\*\[(?:SPEC|NOTE|\?)\]\*\*$/;
const BUG_TAG = /^\*\*\[BUG\]\s*(.*?)\*\*$/;
// A line ending in `<!-- help:key -->` is also shown in the app's help popout of that name
// (ADR 0038). Readers of the guide never see the marker.
const HELP_MARKER = /\s*<!--\s*help:([a-z-]+)\s*-->\s*$/;
const BUG_FIELDS: Record<string, string> = {
  Symptom: "What you see",
  Cause: "Why",
  Fix: "What to do",
};

// Turns the volunteer guides, written in HADS Markdown, into what a volunteer reads in the
// app's Help tab or on paper: no reading instruction for AI, and no block tags.
export function forReaders(markdown: string): string {
  const output: string[] = [];
  let inInstruction = false;

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.replace(HELP_MARKER, "");
    const trimmed = line.trim();
    if (/^##\s+AI READING INSTRUCTION/i.test(trimmed)) {
      inInstruction = true;
      continue;
    }
    if (inInstruction) {
      // The instruction ends at the next rule or section.
      if (trimmed === "---" || trimmed.startsWith("## ")) inInstruction = false;
      if (trimmed !== "---") continue;
    }
    if (PLAIN_TAG.test(trimmed)) continue;

    const bug = BUG_TAG.exec(trimmed);
    if (bug) {
      output.push(`**Problem: ${bug[1]}**`, "");
      continue;
    }
    const field = /^(Symptom|Cause|Fix):\s*(.*)$/.exec(trimmed);
    if (field) {
      output.push(`- **${BUG_FIELDS[field[1] ?? ""]}:** ${field[2]}`);
      continue;
    }
    output.push(line);
  }

  // Removing the instruction leaves two rules in a row.
  return output
    .join("\n")
    .replace(/\n---\n+---\n/g, "\n---\n")
    .replace(/\n{3,}/g, "\n\n");
}

// The lines each help popout shows, as HTML, by the name in their markers, in the guide's order.
export function helpTopics(markdown: string): Record<string, string> {
  const topics = new Map<string, string[]>();
  for (const line of markdown.split(/\r?\n/)) {
    const key = HELP_MARKER.exec(line)?.[1];
    if (!key) continue;
    // A numbered step loses its number, which means nothing outside its list.
    const text = line.replace(HELP_MARKER, "").replace(/^(\s*)\d+\.\s/, "$1- ");
    // A plain line stands on its own, rather than running into a list item above it.
    const block = /^\s*- /.test(text) ? text : `\n${text}\n`;
    topics.set(key, [...(topics.get(key) ?? []), block]);
  }
  const marked = new Marked({ async: false });
  return Object.fromEntries(
    [...topics].map(([key, lines]) => [key, marked.parse(lines.join("\n")) as string]),
  );
}

export function guideToHtml(markdown: string, imageSource: (src: string) => string): string {
  const marked = new Marked({
    async: false,
    walkTokens(token) {
      if (token.type === "image") token.href = imageSource(token.href);
    },
  });
  return marked.parse(forReaders(markdown)) as string;
}
