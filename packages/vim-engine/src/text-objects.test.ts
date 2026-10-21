import { describe, expect, it } from "vitest";
import { findInnerQuotes } from "./text-objects";

const line = 'const mode = "development";';

describe("findInnerQuotes", () => {
  it("finds the inner span from anywhere inside the string", () => {
    for (const column of [14, 18, 24]) {
      expect(findInnerQuotes(line, column, '"')).toEqual({ start: 14, end: 25 });
    }
  });

  it("treats the quote characters themselves as inside", () => {
    expect(findInnerQuotes(line, 13, '"')).toEqual({ start: 14, end: 25 });
    expect(findInnerQuotes(line, 25, '"')).toEqual({ start: 14, end: 25 });
  });

  it("looks forward when the cursor is before the string", () => {
    expect(findInnerQuotes(line, 0, '"')).toEqual({ start: 14, end: 25 });
  });

  it("does not match after the last pair", () => {
    expect(findInnerQuotes(line, 26, '"')).toBeNull();
  });

  it("picks the pair containing the cursor", () => {
    const text = 'a("x", "yy")';
    expect(findInnerQuotes(text, 4, '"')).toEqual({ start: 3, end: 4 });
    expect(findInnerQuotes(text, 9, '"')).toEqual({ start: 8, end: 10 });
  });

  it("uses the next pair when the cursor sits between pairs", () => {
    expect(findInnerQuotes('"a" x "b"', 4, '"')).toEqual({ start: 7, end: 8 });
  });

  it("skips escaped quotes", () => {
    expect(findInnerQuotes('x = "a\\"b";', 6, '"')).toEqual({ start: 5, end: 9 });
  });

  it("handles empty strings", () => {
    expect(findInnerQuotes('x = "";', 4, '"')).toEqual({ start: 5, end: 5 });
  });

  it("returns null without a complete pair", () => {
    expect(findInnerQuotes("no quotes", 2, '"')).toBeNull();
    expect(findInnerQuotes('one " only', 2, '"')).toBeNull();
  });
});
