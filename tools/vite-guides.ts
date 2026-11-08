import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";
import { guideToHtml } from "./guides.js";

const SUFFIX = "?guide";

// Lets the client import a guide as HTML: import html from "…/front-desk.md?guide".
// It is converted at build time, and its pictures become ordinary assets, so the Help
// tab needs no Markdown code in the browser and works offline.
export function guides(): Plugin {
  return {
    name: "mc-fd-dist-guides",
    async load(id) {
      if (!id.endsWith(SUFFIX)) return null;
      const file = id.slice(0, -SUFFIX.length);
      this.addWatchFile(file);
      const pictures: string[] = [];
      const html = guideToHtml(await readFile(file, "utf8"), (src) => {
        pictures.push(resolve(dirname(file), src));
        return `__GUIDE_PICTURE_${pictures.length - 1}__`;
      });

      const imports = pictures.map(
        (picture, index) => `import picture${index} from ${JSON.stringify(picture)};`,
      );
      const value = pictures.reduce(
        (expression, _picture, index) =>
          `${expression}.replaceAll("__GUIDE_PICTURE_${index}__", picture${index})`,
        JSON.stringify(html),
      );
      return `${imports.join("\n")}\nexport default ${value};\n`;
    },
  };
}
