import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_TOPICS } from "../client/src/help-topics.js";
import { helpTopics } from "./guides.js";

// A help popout shows lines marked `<!-- help:key -->` in a guide (ADR 0038). These keep the
// markers and the app's list of popouts in step, and keep each popout short enough to read
// during a shift.

const GUIDES = ["front-desk", "distribution", "admin"] as const;
const MOST_CHARACTERS = 700;

const marked = Object.fromEntries(
  GUIDES.map((guide) => [guide, helpTopics(readFileSync(`docs/guides/en/${guide}.md`, "utf8"))]),
);
const topics = Object.entries(HELP_TOPICS);
// The text between the tags, to count what a person reads. Text itself has no bare < or >.
const readable = (html: string) =>
  html
    .split("<")
    .map((part) => part.slice(part.indexOf(">") + 1))
    .join("")
    .trim();

describe("help popouts", () => {
  it.each(topics)("finds the words for %s in its guide", (key, topic) => {
    const html = marked[topic.guide]?.[key] ?? "";
    expect(readable(html).length, `${topic.guide}.md marks nothing for ${key}`).toBeGreaterThan(0);
    expect(readable(html).length).toBeLessThanOrEqual(MOST_CHARACTERS);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<table");
  });

  it("has no marker that no popout shows", () => {
    for (const guide of GUIDES) {
      for (const key of Object.keys(marked[guide] ?? {})) {
        expect(
          HELP_TOPICS[key as keyof typeof HELP_TOPICS]?.guide,
          `${guide}.md marks ${key}`,
        ).toBe(guide);
      }
    }
  });
});
