// Checks the Release and Deploy workflows run, over the rules in release-version.ts.
//
//   tsx tools/release-checks.ts version 0.2.0 v0.1.0 ...   prints the tag, or fails if the version
//                                                          is not a new one; the rest are the
//                                                          repository's existing tags
//   tsx tools/release-checks.ts image owner/repo DIGEST    prints the image's name by digest
import { formatVersion, imageReference, parseVersion, versionProblems } from "./release-version.js";

const [command, ...args] = process.argv.slice(2);
const [first = "", second = ""] = args;

function refuse(title: string, problem: string): never {
  process.stderr.write(`::error title=${title}::${problem}\n`);
  process.exit(1);
}

if (command === "version" && first) {
  const problems = versionProblems(first, args.slice(1));
  if (problems.length > 0) refuse("Release version refused", problems.join("; "));
  process.stdout.write(`${formatVersion(parseVersion(first)!)}\n`);
} else if (command === "image" && args.length === 2) {
  try {
    process.stdout.write(`${imageReference(first, second)}\n`);
  } catch (error) {
    refuse("Image refused", error instanceof Error ? error.message : String(error));
  }
} else {
  process.stderr.write(
    "Usage: release-checks.ts version VERSION [TAG...] | image REPOSITORY DIGEST\n",
  );
  process.exit(2);
}
