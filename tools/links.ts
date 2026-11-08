const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|#)/i;

// Lists the files a Markdown document links to or shows, relative to the document.
export function localTargets(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...prose.matchAll(LINK)]
    .map((match) => match[1] ?? "")
    .filter((target) => !EXTERNAL.test(target))
    .map((target) => decodeURI(target.split("#")[0] ?? ""));
}
