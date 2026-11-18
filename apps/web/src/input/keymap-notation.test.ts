import { describe, expect, it } from "vitest";
import { keyInputToKeymapToken, keymapTokenToKeyInput } from "./keymap-notation";

/** The bridge between the catalog notation of content/keymaps and the engine's KeyInput (S5). */
describe("catalog notation to KeyInput", () => {
  it("reads one key with its modifiers", () => {
    expect(keymapTokenToKeyInput("C-b")).toEqual({
      key: "b",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
    });
    expect(keymapTokenToKeyInput("Super-q")).toEqual({
      key: "q",
      ctrl: false,
      alt: false,
      shift: false,
      meta: true,
    });
    expect(keymapTokenToKeyInput("M-x")).toMatchObject({ key: "x", alt: true });
  });

  it("reads a plain printable character", () => {
    expect(keymapTokenToKeyInput("%")).toEqual({
      key: "%",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    });
  });

  it("reads named keys the way the browser reports them", () => {
    expect(keymapTokenToKeyInput("Space")).toMatchObject({ key: " " });
    expect(keymapTokenToKeyInput("Esc")).toMatchObject({ key: "Escape" });
    expect(keymapTokenToKeyInput("Enter")).toMatchObject({ key: "Enter" });
    expect(keymapTokenToKeyInput("Left")).toMatchObject({ key: "ArrowLeft" });
    expect(keymapTokenToKeyInput("Super-Enter")).toMatchObject({ key: "Enter", meta: true });
  });

  it("has no KeyInput form for S-, so those bindings are never matched", () => {
    // Shift arrives folded into the character the layout produced (`S-h` is key "H"), so a
    // shift token cannot be compared with what the browser sends: the label never matches it.
    expect(keymapTokenToKeyInput("S-h")).toBeNull();
    expect(keymapTokenToKeyInput("Super-S-Left")).toBeNull();
    expect(keyInputToKeymapToken({ key: "H", shift: true })).toBe("H");
  });

  it("writes a pressed key back in catalog notation", () => {
    for (const token of ["C-b", "%", "Space", "Super-1", "Left", "Super-Enter"]) {
      const input = keymapTokenToKeyInput(token);
      expect(input).not.toBeNull();
      expect(keyInputToKeymapToken(input!)).toBe(token);
    }
  });

  it("leaves a key that is not in the notation unmapped", () => {
    expect(keyInputToKeymapToken({ key: "Backspace" })).toBeNull();
    expect(keymapTokenToKeyInput("NotAKey")).toBeNull();
  });
});
