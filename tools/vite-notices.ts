import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin } from "vite";

interface Notice {
  name: string;
  version: string;
  license: string;
  text: string;
}

const MARKER = "/node_modules/";
const LICENSE_FILE = /^(licen[cs]e|copying)(\.|$)/i;

// The folder of the package that a module comes from, or null for the app's own code.
export function packageRoot(id: string): string | null {
  const path = (id.split("?")[0] ?? "").replaceAll("\\", "/");
  const at = path.lastIndexOf(MARKER);
  if (at < 0) return null;
  const parts = path.slice(at + MARKER.length).split("/");
  const name = parts[0]?.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return name ? path.slice(0, at + MARKER.length) + name : null;
}

async function readNotice(folder: string): Promise<Notice> {
  const manifest = JSON.parse(await readFile(join(folder, "package.json"), "utf8")) as {
    name: string;
    version: string;
    license?: string;
  };
  const file = (await readdir(folder)).find((name) => LICENSE_FILE.test(name));
  const text = file
    ? await readFile(join(folder, file), "utf8")
    : "This package ships no license file. It declares the license above.";
  return { name: manifest.name, version: manifest.version, license: manifest.license ?? "", text };
}

export function formatNotices(notices: Notice[]): string {
  const rule = "=".repeat(78);
  const entries = notices.map(
    (notice) =>
      `${rule}\n${notice.name} ${notice.version}\nLicense: ${notice.license}\n${rule}\n\n` +
      `${notice.text.trim()}\n`,
  );
  return (
    "Third-party notices\n\n" +
    "This app includes the following software and fonts, each under its own license.\n\n" +
    entries.join("\n")
  );
}

export async function buildNotices(ids: Iterable<string>): Promise<string> {
  const roots = new Set<string>();
  for (const id of ids) {
    const root = packageRoot(id);
    if (root) roots.add(root);
  }
  return formatNotices(await Promise.all([...roots].sort().map(readNotice)));
}

// Adds third-party-notices.txt to the client build, listing the license of every package that
// went into it, such as Preact and the fonts. Their licenses require the notice to travel
// with the copies. See ADR 0026.
export function thirdPartyNotices(): Plugin {
  return {
    name: "mc-fd-dist-third-party-notices",
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "third-party-notices.txt",
        source: await buildNotices(this.getModuleIds()),
      });
    },
  };
}
