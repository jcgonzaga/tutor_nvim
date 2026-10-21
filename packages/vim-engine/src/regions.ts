import { comparePositions, leadingBlanks } from "./buffer";
import type { MotionResult } from "./motions";
import type { Position, Register } from "./types";

/**
 * What an operator is applied to, before Vim's normalization: the span between
 * two positions, inclusive or exclusive of `end`, or whole lines.
 */
export interface RawRange {
  readonly start: Position;
  readonly end: Position;
  readonly inclusive: boolean;
  readonly linewise: boolean;
}

/** Normalized target of an operator. Charwise `end` is exclusive; linewise `endLine` is inclusive. */
export type Region =
  | { readonly kind: "char"; readonly start: Position; readonly end: Position }
  | {
      readonly kind: "line";
      readonly startLine: number;
      readonly endLine: number;
      /** Cursor position of the range start; yanks leave the cursor here. */
      readonly anchor: Position;
    };

export function rawRangeFromMotion(cursor: Position, motion: MotionResult): RawRange {
  const forward = comparePositions(motion.position, cursor) >= 0;
  return {
    start: forward ? cursor : motion.position,
    end: forward ? motion.position : cursor,
    inclusive: motion.kind === "inclusive",
    linewise: motion.kind === "linewise",
  };
}

export function currentLineRange(cursor: Position): RawRange {
  return { start: cursor, end: cursor, inclusive: false, linewise: true };
}

/**
 * Applies Vim's rules for exclusive motions (`:help exclusive`): when the end
 * is in column 0 of a later line it moves to the end of the previous line, and
 * when the start is also at or before the first non-blank the motion becomes
 * linewise.
 */
export function finalizeRange(lines: readonly string[], raw: RawRange): Region {
  if (raw.linewise) {
    return { kind: "line", startLine: raw.start.line, endLine: raw.end.line, anchor: raw.start };
  }

  // Text objects may report their ends in either order; Vim swaps them.
  const swapped = comparePositions(raw.start, raw.end) > 0;
  const start = swapped ? raw.end : raw.start;
  let end = swapped ? raw.start : raw.end;
  let inclusive = raw.inclusive;

  if (!inclusive && end.column === 0 && end.line > start.line) {
    const endLine = end.line - 1;
    if (leadingBlanks(lines[start.line] ?? "") >= start.column) {
      return { kind: "line", startLine: start.line, endLine, anchor: start };
    }
    end = { line: endLine, column: (lines[endLine] ?? "").length };
    inclusive = false;
  }

  if (inclusive) {
    const length = (lines[end.line] ?? "").length;
    end = { line: end.line, column: Math.min(end.column + 1, length) };
  }
  return { kind: "char", start, end };
}

export function regionContents(lines: readonly string[], region: Region): Register {
  if (region.kind === "line") {
    return { text: lines.slice(region.startLine, region.endLine + 1).join("\n"), linewise: true };
  }
  const { start, end } = region;
  if (start.line === end.line) {
    return { text: (lines[start.line] ?? "").slice(start.column, end.column), linewise: false };
  }
  const parts = [(lines[start.line] ?? "").slice(start.column)];
  for (let line = start.line + 1; line < end.line; line++) parts.push(lines[line] ?? "");
  parts.push((lines[end.line] ?? "").slice(0, end.column));
  return { text: parts.join("\n"), linewise: false };
}

/**
 * Vim's "empty region" (`oap->empty`): a charwise, exclusive range whose ends
 * coincide. An inclusive range on an empty line is not empty to Vim, even
 * though it covers no characters.
 */
export function isEmptyRange(raw: RawRange): boolean {
  return !raw.linewise && !raw.inclusive && comparePositions(raw.start, raw.end) === 0;
}
