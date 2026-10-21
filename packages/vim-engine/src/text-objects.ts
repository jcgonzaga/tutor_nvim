/**
 * Text objects resolve to a half-open `[start, end)` column span on one line.
 * Registered by the key that follows the `i`/`a` modifier (`"` for `i"`).
 */
export interface ColumnSpan {
  readonly start: number;
  readonly end: number;
}

export type TextObjectFinder = (line: string, column: number) => ColumnSpan | null;

/**
 * Inner span of a quoted string, following Vim's `i"` rules for a single line:
 * quotes are paired left to right (a backslash escapes the next character),
 * the pair containing the cursor wins (cursor on either quote counts), and if
 * the cursor is outside every pair the first pair after it is used.
 */
export function findInnerQuotes(line: string, column: number, quote: string): ColumnSpan | null {
  const quotes: number[] = [];
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "\\") index++;
    else if (char === quote) quotes.push(index);
  }

  for (let pair = 0; pair + 1 < quotes.length; pair += 2) {
    const open = quotes[pair] ?? 0;
    const close = quotes[pair + 1] ?? 0;
    if (column <= close) {
      // Contains the cursor, or lies entirely after it: both resolve to this pair.
      return { start: open + 1, end: close };
    }
  }
  return null;
}

export const INNER_TEXT_OBJECTS: Readonly<Record<string, TextObjectFinder>> = {
  '"': (line, column) => findInnerQuotes(line, column, '"'),
};
