/**
 * Word-wise cursor walking, ported from Vim's `fwd_word`, `bck_word` and
 * `end_word` (textobject.c) so edge cases match: transient positions on the
 * end-of-line "NUL" (column === line length), empty lines as stops, and the
 * end-of-line stop used by `dw`/`cw`.
 *
 * Positions here are mutable locals owned by a single motion call.
 */

export interface Walker {
  line: number;
  column: number;
}

export const isBlank = (char: string): boolean => char === " " || char === "\t";

const lineAt = (lines: readonly string[], line: number): string => lines[line] ?? "";

export function charAt(lines: readonly string[], pos: Walker): string {
  return lineAt(lines, pos.line).charAt(pos.column);
}

/** Moves one character forward. 0 moved, 2 moved onto the end of line, 1 moved to the next line, -1 end of buffer. */
export function inc(lines: readonly string[], pos: Walker): -1 | 0 | 1 | 2 {
  const length = lineAt(lines, pos.line).length;
  if (pos.column < length) {
    pos.column++;
    return pos.column < length ? 0 : 2;
  }
  if (pos.line < lines.length - 1) {
    pos.line++;
    pos.column = 0;
    return 1;
  }
  return -1;
}

/** Moves one character back. 0 moved, 1 moved to the end-of-line position of the previous line, -1 start of buffer. */
export function dec(lines: readonly string[], pos: Walker): -1 | 0 | 1 {
  if (pos.column > 0) {
    pos.column--;
    return 0;
  }
  if (pos.line > 0) {
    pos.line--;
    pos.column = lineAt(lines, pos.line).length;
    return 1;
  }
  return -1;
}

/** `inc`, skipping over the end-of-line position (Vim's `incl`). */
export function incl(lines: readonly string[], pos: Walker): number {
  let result: number = inc(lines, pos);
  if (result >= 1 && pos.column > 0) result = inc(lines, pos);
  return result;
}

/** `dec`, skipping over the end-of-line position (Vim's `decl`). */
export function decl(lines: readonly string[], pos: Walker): number {
  let result: number = dec(lines, pos);
  if (result === 1 && pos.column > 0) result = dec(lines, pos);
  return result;
}

/** Character class: 0 blank/end-of-line, 1 punctuation (or any non-blank for WORDs), 2 keyword. */
export function charClass(char: string, big: boolean): 0 | 1 | 2 {
  if (char === "" || isBlank(char)) return 0;
  if (big) return 1;
  return /[\p{L}\p{N}\p{M}_]/u.test(char) ? 2 : 1;
}

const cls = (lines: readonly string[], pos: Walker, big: boolean) => charClass(charAt(lines, pos), big);
const isEmptyLine = (lines: readonly string[], line: number) => lineAt(lines, line) === "";

function skipChars(
  lines: readonly string[],
  pos: Walker,
  big: boolean,
  wanted: number,
  step: (lines: readonly string[], pos: Walker) => number,
): boolean {
  while (cls(lines, pos, big) === wanted) {
    if (step(lines, pos) === -1) return true;
  }
  return false;
}

/** `w`/`W`. `eol` stops at the end of the line (used with an operator). Returns `false` where Vim fails. */
export function fwdWord(lines: readonly string[], pos: Walker, big: boolean, eol: boolean): boolean {
  const startClass = cls(lines, pos, big);
  const lastLine = pos.line === lines.length - 1;

  let moved = inc(lines, pos);
  if (moved === -1 || (moved >= 1 && lastLine)) return false;
  if (moved >= 1 && eol) return true;

  if (startClass !== 0) {
    while (cls(lines, pos, big) === startClass) {
      moved = inc(lines, pos);
      if (moved === -1 || (moved >= 1 && eol)) return true;
    }
  }

  while (cls(lines, pos, big) === 0) {
    if (pos.column === 0 && isEmptyLine(lines, pos.line)) break;
    moved = inc(lines, pos);
    if (moved === -1 || (moved >= 1 && eol)) return true;
  }
  return true;
}

/** `b`/`B`. */
export function bckWord(lines: readonly string[], pos: Walker, big: boolean): boolean {
  if (dec(lines, pos) === -1) return false;

  while (cls(lines, pos, big) === 0) {
    if (pos.column === 0 && isEmptyLine(lines, pos.line)) return true;
    if (dec(lines, pos) === -1) return true;
  }
  if (skipChars(lines, pos, big, cls(lines, pos, big), dec)) return true;
  inc(lines, pos);
  return true;
}

/**
 * `e`/`E`. `stop` keeps the cursor when it already is on a word end (`cw`);
 * `empty` stops on empty lines (text objects).
 */
export function endWord(
  lines: readonly string[],
  pos: Walker,
  big: boolean,
  stop: boolean,
  empty: boolean,
): boolean {
  const startClass = cls(lines, pos, big);
  if (inc(lines, pos) === -1) return false;

  if (cls(lines, pos, big) === startClass && startClass !== 0) {
    if (skipChars(lines, pos, big, startClass, inc)) return false;
  } else if (!stop || startClass === 0) {
    while (cls(lines, pos, big) === 0) {
      if (empty && pos.column === 0 && isEmptyLine(lines, pos.line)) return true;
      if (inc(lines, pos) === -1) return false;
    }
    if (skipChars(lines, pos, big, cls(lines, pos, big), inc)) return false;
  }
  dec(lines, pos);
  return true;
}

/** Moves back to the start of the current word or blank run, within the line (Vim's `back_in_line`). */
export function backInLine(lines: readonly string[], pos: Walker, big: boolean): void {
  const startClass = cls(lines, pos, big);
  while (pos.column > 0) {
    dec(lines, pos);
    if (cls(lines, pos, big) !== startClass) {
      inc(lines, pos);
      break;
    }
  }
}
