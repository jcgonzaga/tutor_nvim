import { describe, expect, it } from "vitest";
import { findQuotedSpan } from "./text-objects";

const line = 'const mode = "development";';

/** Expectations below were confirmed against real Vim (see the oracle fixtures). */
describe("findQuotedSpan (inner)", () => {
  it("finds the inner span from anywhere inside the string", () => {
    for (const column of [14, 18, 24]) {
      expect(findQuotedSpan(line, column, '"', false)).toEqual({ start: 14, end: 25 });
    }
  });

  it("treats the quote characters themselves as inside", () => {
    expect(findQuotedSpan(line, 13, '"', false)).toEqual({ start: 14, end: 25 });
    expect(findQuotedSpan(line, 25, '"', false)).toEqual({ start: 14, end: 25 });
  });

  it("looks forward when the cursor is before the string", () => {
    expect(findQuotedSpan(line, 0, '"', false)).toEqual({ start: 14, end: 25 });
  });

  it("does not match after the last pair", () => {
    expect(findQuotedSpan(line, 26, '"', false)).toBeNull();
  });

  it("picks the pair containing the cursor", () => {
    const text = 'a("x", "yy")';
    expect(findQuotedSpan(text, 4, '"', false)).toEqual({ start: 3, end: 4 });
    expect(findQuotedSpan(text, 9, '"', false)).toEqual({ start: 8, end: 10 });
  });

  it("between two strings, Vim takes the text between the closest quote behind and the next quote", () => {
    // Not "the next pair": the closing quote of "a" opens the match.
    expect(findQuotedSpan('"a" x "b"', 4, '"', false)).toEqual({ start: 3, end: 6 });
  });

  it("skips escaped quotes", () => {
    expect(findQuotedSpan('x = "a\\"b";', 6, '"', false)).toEqual({ start: 5, end: 9 });
  });

  it("handles empty strings", () => {
    expect(findQuotedSpan('x = "";', 4, '"', false)).toEqual({ start: 5, end: 5 });
  });

  it("returns null without a complete pair", () => {
    expect(findQuotedSpan("no quotes", 2, '"', false)).toBeNull();
    expect(findQuotedSpan('one " only', 2, '"', false)).toBeNull();
  });
});

describe("findQuotedSpan (around)", () => {
  it("includes the quotes and the blanks after the closing quote", () => {
    expect(findQuotedSpan('say "hi"  now', 6, '"', true)).toEqual({ start: 4, end: 10 });
  });

  it("falls back to the blanks before the opening quote", () => {
    expect(findQuotedSpan('say  "hi"', 7, '"', true)).toEqual({ start: 3, end: 9 });
  });
});
