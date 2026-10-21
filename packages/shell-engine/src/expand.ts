import { getNode, resolveParts, sortedNames, type DirNode } from "./fs";
import type { Word } from "./parse";

export interface ExpandContext {
  readonly root: DirNode;
  readonly cwd: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly status: number;
}

/** `$NAME`, `${NAME}` and `$?` inside text that is not single-quoted. */
function substituteVariables(text: string, ctx: ExpandContext): string {
  return text.replace(
    /\$(\?|\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
    (_m, all, braced, plain) => {
      if (all === "?") return String(ctx.status);
      return ctx.env[(braced ?? plain) as string] ?? "";
    },
  );
}

/** Turns a glob into a regular expression; `*` and `?` never match `/`. */
function globToRegExp(pattern: readonly { text: string; literal: boolean }[]): RegExp {
  let source = "";
  for (const { text, literal } of pattern) {
    for (const c of text) {
      if (!literal && c === "*") source += "[^/]*";
      else if (!literal && c === "?") source += "[^/]";
      else source += c.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * Expands one word into the arguments it stands for: tilde, variables, quote removal and globbing
 * (`*` and `?`, no brackets or braces). A pattern with no match stays as typed, as in bash.
 */
export function expandWord(word: Word, ctx: ExpandContext): string[] {
  // Build the text and, per character, whether it may act as a glob metacharacter.
  const pieces: { text: string; literal: boolean }[] = [];
  word.forEach((segment, index) => {
    let text = segment.text;
    if (segment.quote !== "single") text = substituteVariables(text, ctx);
    if (index === 0 && segment.quote === "none" && (text === "~" || text.startsWith("~/"))) {
      text = (ctx.env.HOME ?? "/") + text.slice(1);
      pieces.push({ text, literal: true });
      return;
    }
    pieces.push({ text, literal: segment.quote !== "none" });
  });

  const joined = pieces.map((piece) => piece.text).join("");
  // An unquoted expansion that comes out empty (`$UNSET`) disappears; `""` stays as an empty argument.
  if (joined === "" && word.every((segment) => segment.quote === "none")) return [];
  const hasGlob = pieces.some((piece) => !piece.literal && /[*?]/.test(piece.text));
  if (!hasGlob) return [joined];

  // Match the pattern one path component at a time against the tree.
  const absolute = joined.startsWith("/");
  const components: { text: string; literal: boolean }[][] = [[]];
  for (const piece of pieces) {
    const parts = piece.text.split("/");
    parts.forEach((part, i) => {
      if (i > 0) components.push([]);
      components[components.length - 1]?.push({ text: part, literal: piece.literal });
    });
  }
  const parts = components.filter((c) => c.length > 0 && c.some((p) => p.text !== ""));
  let candidates: string[] = [absolute ? "/" : ""];
  for (const component of parts) {
    const next: string[] = [];
    const plain = component.map((piece) => piece.text).join("");
    const isGlob = component.some((piece) => !piece.literal && /[*?]/.test(piece.text));
    for (const base of candidates) {
      if (!isGlob) {
        next.push(base === "" || base === "/" ? `${base}${plain}` : `${base}/${plain}`);
        continue;
      }
      const dirParts = resolveParts(ctx.cwd, base === "" ? "." : base);
      const dir = getNode(ctx.root, dirParts);
      if (dir?.kind !== "dir") continue;
      const regexp = globToRegExp(component);
      for (const name of sortedNames(dir)) {
        // Hidden files only match patterns that start with a literal dot.
        if (name.startsWith(".") && !plain.startsWith(".")) continue;
        if (regexp.test(name))
          next.push(base === "" || base === "/" ? `${base}${name}` : `${base}/${name}`);
      }
    }
    candidates = next;
  }
  const existing = candidates.filter(
    (path) => getNode(ctx.root, resolveParts(ctx.cwd, path)) !== undefined,
  );
  return existing.length > 0 ? existing : [joined];
}

/** Expands every word of a command into its argument list. */
export const expandWords = (words: readonly Word[], ctx: ExpandContext): string[] =>
  words.flatMap((word) => expandWord(word, ctx));
