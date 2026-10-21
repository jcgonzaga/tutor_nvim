import { describe, expect, it } from "vitest";
import { accepted, run, start } from "./helpers.test-util";

const cursorAfter = (text: string, from: [number, number], keys: string) =>
  run(text, from, keys).cursor;

describe("h j k l", () => {
  it("stay inside the buffer", () => {
    expect(cursorAfter("abc", [0, 0], "h")).toEqual([0, 0]);
    expect(cursorAfter("abc", [0, 2], "l")).toEqual([0, 2]);
    expect(cursorAfter("a\nb", [0, 0], "k")).toEqual([0, 0]);
    expect(cursorAfter("a\nb", [1, 0], "j")).toEqual([1, 0]);
  });

  it("report failed moves as not accepted", () => {
    expect(accepted(start("abc"), "hl")).toEqual([false, true]);
  });

  it("keep the desired column through short and empty lines", () => {
    const text = "abcdefghij\nab\n\nabcdefghij";
    expect(cursorAfter(text, [0, 7], "j")).toEqual([1, 1]);
    expect(cursorAfter(text, [0, 7], "jj")).toEqual([2, 0]);
    expect(cursorAfter(text, [0, 7], "jjj")).toEqual([3, 7]);
    expect(cursorAfter(text, [3, 7], "kkk")).toEqual([0, 7]);
  });

  it("make `$` stick to the end of every line", () => {
    const text = "abc\nabcdefg\nxy";
    expect(cursorAfter(text, [0, 0], "$j")).toEqual([1, 6]);
    expect(cursorAfter(text, [0, 0], "$jj")).toEqual([2, 1]);
  });

  it("forget the desired column once the cursor moves sideways", () => {
    expect(cursorAfter("abcdefgh\nab\nabcdefgh", [0, 6], "jhjj")).toEqual([2, 0]);
  });
});

describe("0 ^ $", () => {
  it("jump to line start, first non-blank and line end", () => {
    expect(cursorAfter("  foo bar", [0, 5], "0")).toEqual([0, 0]);
    expect(cursorAfter("  foo bar", [0, 5], "^")).toEqual([0, 2]);
    expect(cursorAfter("  foo bar", [0, 0], "$")).toEqual([0, 8]);
  });

  it("handle empty and blank-only lines", () => {
    expect(cursorAfter("", [0, 0], "$")).toEqual([0, 0]);
    expect(cursorAfter("    ", [0, 0], "^")).toEqual([0, 3]);
  });
});

describe("w W b B e E", () => {
  it("w moves to the next word start, treating punctuation as a word", () => {
    expect(cursorAfter("foo bar  baz", [0, 0], "w")).toEqual([0, 4]);
    expect(cursorAfter("foo bar  baz", [0, 4], "w")).toEqual([0, 9]);
    expect(cursorAfter("foo.bar baz", [0, 0], "w")).toEqual([0, 3]);
    expect(cursorAfter("foo.bar baz", [0, 0], "ww")).toEqual([0, 4]);
  });

  it("W moves over punctuation as part of the WORD", () => {
    expect(cursorAfter("foo.bar baz", [0, 0], "W")).toEqual([0, 8]);
    expect(cursorAfter("foo.bar baz", [0, 8], "B")).toEqual([0, 0]);
  });

  it("w crosses lines and stops on empty lines", () => {
    expect(cursorAfter("foo\nbar", [0, 0], "w")).toEqual([1, 0]);
    expect(cursorAfter("foo\n\nbar", [0, 0], "w")).toEqual([1, 0]);
    expect(cursorAfter("foo\n\nbar", [0, 0], "ww")).toEqual([2, 0]);
    expect(cursorAfter("foo\n  bar", [0, 0], "w")).toEqual([1, 2]);
  });

  it("w on the last word of the buffer goes to its last character and then fails", () => {
    expect(cursorAfter("foo bar", [0, 4], "w")).toEqual([0, 6]);
    expect(accepted(start("foo bar", [0, 4]), "ww")).toEqual([true, false]);
  });

  it("b moves back over blanks and across lines", () => {
    expect(cursorAfter("foo bar  baz", [0, 9], "b")).toEqual([0, 4]);
    expect(cursorAfter("foo bar  baz", [0, 6], "b")).toEqual([0, 4]);
    expect(cursorAfter("foo\nbar", [1, 0], "b")).toEqual([0, 0]);
    expect(cursorAfter("foo\n\nbar", [2, 0], "b")).toEqual([1, 0]);
    expect(accepted(start("foo"), "b")).toEqual([false]);
  });

  it("e moves to the end of the current or next word", () => {
    expect(cursorAfter("foo bar", [0, 0], "e")).toEqual([0, 2]);
    expect(cursorAfter("foo bar", [0, 2], "e")).toEqual([0, 6]);
    expect(cursorAfter("foo\nbar", [0, 2], "e")).toEqual([1, 2]);
    expect(cursorAfter("foo.bar", [0, 0], "e")).toEqual([0, 2]);
    expect(cursorAfter("foo.bar baz", [0, 0], "E")).toEqual([0, 6]);
  });
});

describe("f t ; ,", () => {
  const text = "a,b,c,d";

  it("f jumps onto the character, t stops before it", () => {
    expect(cursorAfter(text, [0, 0], "f,")).toEqual([0, 1]);
    expect(cursorAfter(text, [0, 0], "t,")).toEqual([0, 0]);
    expect(cursorAfter(text, [0, 2], "t,")).toEqual([0, 2]);
  });

  it("; repeats forward and , repeats backward", () => {
    expect(cursorAfter(text, [0, 0], "f,;")).toEqual([0, 3]);
    expect(cursorAfter(text, [0, 0], "f,;;")).toEqual([0, 5]);
    expect(cursorAfter(text, [0, 0], "f,;;,")).toEqual([0, 3]);
  });

  it("; after t does not get stuck in front of the same character", () => {
    expect(cursorAfter(text, [0, 0], "t,;")).toEqual([0, 2]);
    expect(cursorAfter(text, [0, 0], "t,;;")).toEqual([0, 4]);
  });

  it("a failed search leaves the cursor in place and cancels the command", () => {
    const state = start(text);
    expect(cursorAfter(text, [0, 2], "fz")).toEqual([0, 2]);
    expect(accepted(state, "fz")).toEqual([true, false]);
    expect(run(text, [0, 2], "fzx").text).toBe("a,,c,d");
  });

  it("; and , do nothing without a previous search", () => {
    expect(accepted(start(text), ";,")).toEqual([false, false]);
  });

  it("only search the current line", () => {
    expect(cursorAfter("abc\nxyz", [0, 0], "fz")).toEqual([0, 0]);
  });
});
