// Builds printable PDFs of the volunteer guides, from the same Markdown as the Help tab.
//
//   npm run docs:pdf
//
// PDFs are written to dist/guides/<language>/. A quick card that runs past one page
// fails the build, because it is meant to be printed and kept at the station.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { guideToHtml } from "./guides.js";

const SOURCE = resolve("docs/guides");
const OUTPUT = resolve("dist/guides");

const PRINT_CSS = `
  body { font: 12pt/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  h2 { font-size: 15pt; margin: 14pt 0 4pt; break-after: avoid; }
  hr { border: 0; border-top: 1px solid #ced4da; }
  img { display: block; max-width: 100%; max-height: 4in; margin: 6pt 0; border: 1px solid #ced4da; break-inside: avoid; }
  table { border-collapse: collapse; margin: 6pt 0; }
  th, td { border: 1px solid #ced4da; padding: 3pt 8pt; text-align: left; }
  li { margin: 2pt 0; }
`;

function pictureAsData(guideFile: string): (src: string) => string {
  return (src) => {
    const picture = readFileSync(resolve(dirname(guideFile), src));
    return `data:image/png;base64,${picture.toString("base64")}`;
  };
}

function pageCount(pdf: Buffer): number {
  return pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

const browser = await chromium.launch();
const problems: string[] = [];
try {
  // One page, reused for each guide in turn, so the guides are printed one at a time.
  /* oxlint-disable no-await-in-loop */
  const page = await browser.newPage();
  for (const language of readdirSync(SOURCE).filter((name) => name !== "images")) {
    mkdirSync(join(OUTPUT, language), { recursive: true });
    for (const name of readdirSync(join(SOURCE, language)).filter((file) => file.endsWith(".md"))) {
      const file = join(SOURCE, language, name);
      const body = guideToHtml(readFileSync(file, "utf8"), pictureAsData(file));
      await page.setContent(
        // nosemgrep: html-in-template-string -- builds a print page from this repository's own guides, never from user input
        `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body>${body}</body></html>`,
      );
      const pdf = await page.pdf({
        format: "Letter",
        margin: { top: "0.6in", bottom: "0.6in", left: "0.7in", right: "0.7in" },
        printBackground: true,
      });
      const target = join(OUTPUT, language, `${basename(name, ".md")}.pdf`);
      writeFileSync(target, pdf);
      const pages = pageCount(pdf);
      console.log(
        `wrote ${language}/${basename(target)} (${pages} ${pages === 1 ? "page" : "pages"})`,
      );
      if (name.endsWith("-card.md") && pages !== 1) {
        problems.push(`${language}/${name} is ${pages} pages; a quick card must fit on one`);
      }
    }
  }
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
