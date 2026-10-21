import type { Position, TextBuffer, VimMode } from "./types";

/**
 * Split text into lines the way Vim reads a file: a single trailing newline
 * terminates the last line instead of starting an empty one.
 */
export function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function createBuffer(text: string): TextBuffer {
  return { lines: splitLines(text) };
}

export function bufferFromLines(lines: readonly string[]): TextBuffer {
  return { lines: lines.length > 0 ? [...lines] : [""] };
}

/** Joins lines with `\n` (no trailing newline). */
export function bufferToText(buffer: TextBuffer): string {
  return buffer.lines.join("\n");
}

export function lineCount(buffer: TextBuffer): number {
  return buffer.lines.length;
}

export function readLine(buffer: TextBuffer, line: number): string {
  const text = buffer.lines[line];
  if (text === undefined) {
    throw new RangeError(`Line ${line} is outside the buffer (${buffer.lines.length} lines)`);
  }
  return text;
}

export function comparePositions(a: Position, b: Position): number {
  return a.line !== b.line ? a.line - b.line : a.column - b.column;
}

export function isValidPosition(buffer: TextBuffer, position: Position): boolean {
  const text = buffer.lines[position.line];
  return (
    text !== undefined &&
    Number.isInteger(position.line) &&
    Number.isInteger(position.column) &&
    position.column >= 0 &&
    position.column <= text.length
  );
}

/**
 * Replaces the half-open range `[start, end)` with `text` (which may contain
 * newlines). Returns the new buffer and the position just after the inserted text.
 */
export function replaceRange(
  buffer: TextBuffer,
  start: Position,
  end: Position,
  text: string,
): { buffer: TextBuffer; end: Position } {
  if (!isValidPosition(buffer, start) || !isValidPosition(buffer, end)) {
    throw new RangeError("Range positions are outside the buffer");
  }
  if (comparePositions(start, end) > 0) {
    throw new RangeError("Range start must not be after range end");
  }

  const head = readLine(buffer, start.line).slice(0, start.column);
  const tail = readLine(buffer, end.line).slice(end.column);
  const inserted = text.split("\n");
  const first = inserted[0] ?? "";
  const last = inserted[inserted.length - 1] ?? "";

  const replacement =
    inserted.length === 1
      ? [head + first + tail]
      : [head + first, ...inserted.slice(1, -1), last + tail];

  const lines = [
    ...buffer.lines.slice(0, start.line),
    ...replacement,
    ...buffer.lines.slice(end.line + 1),
  ];
  const endLine = start.line + inserted.length - 1;
  const endColumn = inserted.length === 1 ? start.column + first.length : last.length;

  return { buffer: { lines }, end: { line: endLine, column: endColumn } };
}

export function insertText(
  buffer: TextBuffer,
  at: Position,
  text: string,
): { buffer: TextBuffer; end: Position } {
  return replaceRange(buffer, at, at, text);
}

export function deleteRange(buffer: TextBuffer, start: Position, end: Position): TextBuffer {
  return replaceRange(buffer, start, end, "").buffer;
}

/**
 * Clamps a position into the buffer. NORMAL mode keeps the cursor on a
 * character (or column 0 of an empty line); INSERT may sit past the last one.
 */
export function normalizeCursor(buffer: TextBuffer, position: Position, mode: VimMode): Position {
  const line = Math.min(Math.max(position.line, 0), buffer.lines.length - 1);
  const length = readLine(buffer, line).length;
  const maxColumn = mode === "insert" ? length : Math.max(length - 1, 0);
  return { line, column: Math.min(Math.max(position.column, 0), maxColumn) };
}

/** Number of leading blanks (spaces and tabs). */
export function leadingBlanks(line: string): number {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0].length : 0;
}

/** Column of the first non-blank, or the last column when the line is all blanks (Vim's `^`). */
export function firstNonBlankColumn(line: string): number {
  const blanks = leadingBlanks(line);
  return blanks < line.length ? blanks : Math.max(line.length - 1, 0);
}

export function sameLines(a: TextBuffer, b: TextBuffer): boolean {
  return a === b || (a.lines.length === b.lines.length && a.lines.every((line, i) => line === b.lines[i]));
}
