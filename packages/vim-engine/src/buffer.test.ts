import { describe, expect, it } from "vitest";
import {
  bufferToText,
  createBuffer,
  deleteRange,
  insertText,
  normalizeCursor,
  readLine,
  replaceRange,
  splitLines,
} from "./buffer";

describe("splitLines", () => {
  it("treats a single trailing newline as a line terminator", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
  });

  it("keeps intentional empty lines and the empty buffer", () => {
    expect(splitLines("a\n\n")).toEqual(["a", ""]);
    expect(splitLines("")).toEqual([""]);
    expect(splitLines("\n")).toEqual([""]);
  });

  it("normalizes CRLF", () => {
    expect(splitLines("a\r\nb\r\n")).toEqual(["a", "b"]);
  });
});

describe("buffer editing", () => {
  const buffer = createBuffer("one\ntwo\nthree\n");

  it("reads lines and rejects out-of-range access", () => {
    expect(readLine(buffer, 1)).toBe("two");
    expect(() => readLine(buffer, 3)).toThrow(RangeError);
  });

  it("inserts within a line and reports the end position", () => {
    const result = insertText(buffer, { line: 1, column: 1 }, "XY");
    expect(result.buffer.lines).toEqual(["one", "tXYwo", "three"]);
    expect(result.end).toEqual({ line: 1, column: 3 });
  });

  it("inserts multiline text", () => {
    const result = insertText(buffer, { line: 0, column: 1 }, "A\nB\nC");
    expect(result.buffer.lines).toEqual(["oA", "B", "Cne", "two", "three"]);
    expect(result.end).toEqual({ line: 2, column: 1 });
  });

  it("deletes inside a line", () => {
    const result = deleteRange(buffer, { line: 2, column: 1 }, { line: 2, column: 4 });
    expect(result.lines).toEqual(["one", "two", "te"]);
  });

  it("deletes across lines", () => {
    const result = deleteRange(buffer, { line: 0, column: 2 }, { line: 2, column: 2 });
    expect(result.lines).toEqual(["onree"]);
  });

  it("replaces a range with a different number of lines", () => {
    const result = replaceRange(buffer, { line: 0, column: 0 }, { line: 1, column: 3 }, "x");
    expect(result.buffer.lines).toEqual(["x", "three"]);
  });

  it("does not mutate the original buffer", () => {
    insertText(buffer, { line: 0, column: 0 }, "zzz");
    expect(bufferToText(buffer)).toBe("one\ntwo\nthree");
  });

  it("rejects invalid or inverted ranges", () => {
    expect(() => deleteRange(buffer, { line: 0, column: 9 }, { line: 0, column: 9 })).toThrow(
      RangeError,
    );
    expect(() => deleteRange(buffer, { line: 1, column: 0 }, { line: 0, column: 0 })).toThrow(
      RangeError,
    );
  });
});

describe("normalizeCursor", () => {
  const buffer = createBuffer("abc\n\nxy");

  it("keeps NORMAL cursors on a character", () => {
    expect(normalizeCursor(buffer, { line: 0, column: 9 }, "normal")).toEqual({
      line: 0,
      column: 2,
    });
    expect(normalizeCursor(buffer, { line: 1, column: 4 }, "normal")).toEqual({
      line: 1,
      column: 0,
    });
  });

  it("allows INSERT cursors past the last character", () => {
    expect(normalizeCursor(buffer, { line: 0, column: 9 }, "insert")).toEqual({
      line: 0,
      column: 3,
    });
  });

  it("clamps the line", () => {
    expect(normalizeCursor(buffer, { line: 99, column: 0 }, "normal")).toEqual({
      line: 2,
      column: 0,
    });
    expect(normalizeCursor(buffer, { line: -1, column: -1 }, "normal")).toEqual({
      line: 0,
      column: 0,
    });
  });
});
