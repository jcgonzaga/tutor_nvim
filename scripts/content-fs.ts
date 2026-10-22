import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCALES,
  SOURCE_LOCALE,
  validateContent,
  validateLocale,
  type ContentBundle,
  type ContentInput,
  type ContentSource,
  type Locale,
  type LocaleInput,
} from "@tutor-nvim/exercise-schema";

export const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Where content lives. `CONTENT_ROOT` points the validation scripts at another directory (the CI
 * gate tests use it to prove a broken copy is rejected); by default it is `content/`.
 */
export const contentRoot = process.env.CONTENT_ROOT ?? join(root, "content");

function* yamlFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* yamlFiles(path);
    else if (/\.ya?ml$/.test(entry.name)) yield path;
  }
}

function read(kind: "skills" | "exercises", base = ""): ContentSource[] {
  const dir = join(contentRoot, base, kind);
  if (!existsSync(dir)) return [];
  return [...yamlFiles(dir)]
    .sort()
    .map((file) => ({ path: relative(contentRoot, file), text: readFileSync(file, "utf8") }));
}

/** Reads the translation overlays of one language from `content/locales/<locale>`. */
export function readLocaleInput(locale: Locale): LocaleInput {
  const base = join("locales", locale);
  return { skills: read("skills", base), exercises: read("exercises", base) };
}

/** Reads `content/skills` and `content/exercises` from disk. */
export function readContentInput(): ContentInput {
  return { skills: read("skills"), exercises: read("exercises") };
}

/**
 * Loads and cross-validates all content and every translation, or prints every problem and exits
 * non-zero. The source language (English) is the content itself; the others are overlays.
 */
export function loadContentOrExit(command: string): ContentBundle {
  const { bundle, errors } = validateContent(readContentInput());
  if (bundle !== null) {
    for (const locale of LOCALES) {
      if (locale === SOURCE_LOCALE) continue;
      errors.push(...validateLocale(locale, bundle, readLocaleInput(locale)).errors);
    }
  }
  if (bundle === null || errors.length > 0) {
    console.error(errors.join("\n"));
    console.error(
      `\n${command} failed (${errors.length} problem${errors.length === 1 ? "" : "s"})`,
    );
    process.exit(1);
  }
  return bundle;
}
