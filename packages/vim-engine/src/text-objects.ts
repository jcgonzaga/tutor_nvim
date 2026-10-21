import { leadingBlanks } from "./buffer";
import type { RawRange } from "./regions";
import type { Position, TextObjectModifier } from "./types";
import {
  backInLine,
  charAt,
  charClass,
  decl,
  endWord,
  fwdWord,
  inc,
  incl,
  isBlank,
  type Walker,
} from "./words";

/**
 * Text objects, ported from Vim's `current_word`, `current_quote` and
 * `current_block` so that edge cases (cursor outside the object, nested and
 * multi-line blocks) behave like the real editor.
 */
export interface TextObjectEnv {
  readonly lines: readonly string[];
  readonly cursor: Position;
}

export type TextObjectFinder = (env: TextObjectEnv) => RawRange | null;

const lineAt = (lines: readonly string[], line: number): string => lines[line] ?? "";

// --- iw ----------------------------------------------------------------------------------------

/** `iw`: the word, or the run of blanks, under the cursor. */
export const innerWord: TextObjectFinder = ({ lines, cursor }) => {
  const pos: Walker = { line: cursor.line, column: cursor.column };
  backInLine(lines, pos, false);
  const start: Position = { line: pos.line, column: pos.column };

  if (charClass(charAt(lines, pos), false) !== 0) {
    if (!endWord(lines, pos, false, true, true)) return null;
  } else {
    fwdWord(lines, pos, false, true);
    if (pos.column === 0) decl(lines, pos);
    else pos.column--;
  }
  return { start, end: { line: pos.line, column: pos.column }, inclusive: true, linewise: false };
};

// --- quotes ------------------------------------------------------------------------------------

export interface ColumnSpan {
  readonly start: number;
  readonly end: number;
}

function findNextQuote(line: string, from: number, quote: string, escape: boolean): number {
  for (let col = from; col < line.length; col++) {
    const char = line.charAt(col);
    if (escape && char === "\\") {
      col++;
      if (col >= line.length) return -1;
    } else if (char === quote) {
      return col;
    }
  }
  return -1;
}

function findPrevQuote(line: string, from: number, quote: string): number {
  let col = from;
  while (col > 0) {
    col--;
    let escapes = 0;
    while (col - escapes > 0 && line.charAt(col - escapes - 1) === "\\") escapes++;
    if (escapes % 2 === 1) col -= escapes;
    else if (line.charAt(col) === quote) break;
  }
  return col;
}

/**
 * Span `[start, end)` of the quoted string around (or after) `column`, on one
 * line. With `include`, the quotes and the blanks after the closing quote (or,
 * if there are none, before the opening one) are part of it.
 */
export function findQuotedSpan(
  line: string,
  column: number,
  quote: string,
  include: boolean,
): ColumnSpan | null {
  let open = column;
  let close: number;

  if (line.charAt(open) === quote) {
    // On a quote: only counting from the start of the line tells opening from closing.
    open = 0;
    for (;;) {
      open = findNextQuote(line, open, quote, false);
      if (open < 0 || open > column) return null;
      close = findNextQuote(line, open + 1, quote, true);
      if (close < 0) return null;
      if (open <= column && column <= close) break;
      open = close + 1;
    }
  } else {
    // Elsewhere Vim looks for the closest quote *behind* the cursor, then ahead.
    open = findPrevQuote(line, open, quote);
    if (line.charAt(open) !== quote) {
      open = findNextQuote(line, open, quote, false);
      if (open < 0) return null;
    }
    close = findNextQuote(line, open + 1, quote, true);
    if (close < 0) return null;
  }

  if (!include) return { start: open + 1, end: close };

  if (isBlank(line.charAt(close + 1))) {
    while (isBlank(line.charAt(close + 1))) close++;
  } else {
    while (open > 0 && isBlank(line.charAt(open - 1))) open--;
  }
  return { start: open, end: close + 1 };
}

function quoteObject(quote: string, include: boolean): TextObjectFinder {
  return ({ lines, cursor }) => {
    const span = findQuotedSpan(lineAt(lines, cursor.line), cursor.column, quote, include);
    if (span === null) return null;
    return {
      start: { line: cursor.line, column: span.start },
      end: { line: cursor.line, column: span.end },
      inclusive: false,
      linewise: false,
    };
  };
}

// --- blocks ------------------------------------------------------------------------------------

/** Scans for the bracket that `from` is enclosed by (`backward`) or closed by (`forward`), nesting-aware. */
function findBracket(
  lines: readonly string[],
  from: Position,
  wanted: string,
  nested: string,
  backward: boolean,
): Position | null {
  let depth = 0;
  const consider = (line: number, column: number): Position | null => {
    const char = lineAt(lines, line).charAt(column);
    if (char === nested) depth++;
    else if (char === wanted) {
      if (depth === 0) return { line, column };
      depth--;
    }
    return null;
  };

  if (backward) {
    for (let line = from.line; line >= 0; line--) {
      const start = line === from.line ? from.column - 1 : lineAt(lines, line).length - 1;
      for (let column = start; column >= 0; column--) {
        const found = consider(line, column);
        if (found) return found;
      }
    }
  } else {
    for (let line = from.line; line < lines.length; line++) {
      const first = line === from.line ? from.column + 1 : 0;
      for (let column = first; column < lineAt(lines, line).length; column++) {
        const found = consider(line, column);
        if (found) return found;
      }
    }
  }
  return null;
}

/** True when everything before the position (plus `extra` characters) is blank (Vim's `inindent`). */
const inIndent = (lines: readonly string[], pos: Walker, extra: number): boolean =>
  leadingBlanks(lineAt(lines, pos.line)) >= pos.column + extra;

function blockObject(open: string, close: string, include: boolean): TextObjectFinder {
  return ({ lines, cursor }) => {
    const pos: Walker = { line: cursor.line, column: cursor.column };

    if (open === "{") {
      while (inIndent(lines, pos, 1)) if (inc(lines, pos) !== 0) break;
    }
    if (charAt(lines, pos) === open) pos.column++;

    // Outside any block, Vim 9.1 selects the next one ahead (possibly on a later line).
    const openPos =
      findBracket(lines, pos, open, close, true) ?? findBracket(lines, pos, open, close, false);
    if (openPos === null) return null;
    const closePos = findBracket(lines, openPos, close, open, false);
    if (closePos === null) return null;

    if (include) {
      return { start: openPos, end: closePos, inclusive: true, linewise: false };
    }

    // Inner block: skip the brackets, and indentation before a closing bracket on its own line.
    const start: Walker = { line: openPos.line, column: openPos.column };
    incl(lines, start);
    const end: Walker = { line: closePos.line, column: closePos.column };
    let startOfLine = end.column === 0;
    decl(lines, end);
    while (inIndent(lines, end, 1)) {
      startOfLine = true;
      if (decl(lines, end) !== 0) break;
    }

    const startPos: Position = { line: start.line, column: start.column };
    let inclusive = false;
    if (startOfLine) {
      incl(lines, end);
    } else if (
      startPos.line < end.line ||
      (startPos.line === end.line && startPos.column <= end.column)
    ) {
      inclusive = true;
    } else {
      // Nothing between the brackets: operate on nothing.
      end.line = startPos.line;
      end.column = startPos.column;
    }
    return {
      start: startPos,
      end: { line: end.line, column: end.column },
      inclusive,
      linewise: false,
    };
  };
}

/** Text objects by modifier and key, e.g. `TEXT_OBJECTS.inner['"']` is `i"`. */
export const TEXT_OBJECTS: Readonly<
  Record<TextObjectModifier, Readonly<Record<string, TextObjectFinder>>>
> = {
  inner: {
    w: innerWord,
    '"': quoteObject('"', false),
    "(": blockObject("(", ")", false),
    "{": blockObject("{", "}", false),
  },
  around: {
    '"': quoteObject('"', true),
    "(": blockObject("(", ")", true),
    "{": blockObject("{", "}", true),
  },
};
