import { describe, expect, it } from "vitest";
import { KeySequenceError, formatKey, parseKeySequence, tokenizeKeySequence } from "./keys";

describe("key notation", () => {
  it("tokenizes characters and special keys", () => {
    expect(tokenizeKeySequence('ci"ab<Esc>')).toEqual(["c", "i", '"', "a", "b", "<Esc>"]);
  });

  it("canonicalizes special key names", () => {
    expect(tokenizeKeySequence("<esc><ESC><Space><lt>")).toEqual([
      "<Esc>",
      "<Esc>",
      "<Space>",
      "<lt>",
    ]);
    expect(tokenizeKeySequence("a b")).toEqual(["a", "<Space>", "b"]);
  });

  it("parses to browser-style key values", () => {
    expect(parseKeySequence("<Esc>x<Space><lt>")).toEqual([
      { key: "Escape" },
      { key: "x" },
      { key: " " },
      { key: "<" },
    ]);
  });

  it("supports control combinations", () => {
    expect(parseKeySequence("<C-r>")).toEqual([{ key: "r", ctrl: true }]);
    expect(formatKey({ key: "R", ctrl: true })).toBe("<C-r>");
  });

  it("formats browser events back to the same tokens", () => {
    expect(formatKey({ key: "Escape", code: "Escape" })).toBe("<Esc>");
    expect(formatKey({ key: "ArrowLeft" })).toBe("<Left>");
    expect(formatKey({ key: '"', code: "Digit2", shift: true })).toBe('"');
    expect(formatKey({ key: "F5" })).toBe("<F5>");
  });

  it("handles non-BMP and accented characters as single keys", () => {
    expect(tokenizeKeySequence("ñ😀")).toEqual(["ñ", "😀"]);
  });

  it("rejects unknown notation", () => {
    expect(() => parseKeySequence("<Nope>")).toThrow(KeySequenceError);
    expect(() => parseKeySequence("<Nope>")).toThrow("Unknown key notation <Nope>");
  });

  it("treats a bare < as a literal", () => {
    expect(tokenizeKeySequence("a<b")).toEqual(["a", "<lt>", "b"]);
  });
});
