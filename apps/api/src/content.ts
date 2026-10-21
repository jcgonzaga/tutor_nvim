import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateContent,
  type ContentBundle,
  type ContentInput,
  type ContentSource,
} from "@tutor-nvim/exercise-schema";

const defaultRoot = fileURLToPath(new URL("../../../content", import.meta.url));

function* yamlFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* yamlFiles(path);
    else if (/\.ya?ml$/.test(entry.name)) yield path;
  }
}

function read(root: string, kind: "skills" | "exercises"): ContentSource[] {
  return [...yamlFiles(join(root, kind))]
    .sort()
    .map((file) => ({ path: relative(root, file), text: readFileSync(file, "utf8") }));
}

/**
 * Reads and cross-validates the content directory. The API refuses to start on invalid content, for
 * the same reason the web build does: broken content must never reach runtime.
 */
export function loadContentBundle(root: string = defaultRoot): ContentBundle {
  const input: ContentInput = { skills: read(root, "skills"), exercises: read(root, "exercises") };
  const { bundle, errors } = validateContent(input);
  if (bundle === null) throw new Error(`Invalid content:\n${errors.join("\n")}`);
  return bundle;
}
