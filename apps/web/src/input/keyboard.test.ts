import { describe, expect, it } from "vitest";
import { shouldPreventDefault, toKeyInput, type KeyboardEventLike } from "./keyboard";

function event(
  overrides: Partial<KeyboardEventLike> & Pick<KeyboardEventLike, "key" | "code">,
): KeyboardEventLike {
  return { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...overrides };
}

describe("toKeyInput", () => {
  it("keeps both the logical key and the physical code", () => {
    expect(toKeyInput(event({ key: "c", code: "KeyC" }), 12.5)).toEqual({
      key: "c",
      code: "KeyC",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      timestamp: 12.5,
    });
  });

  it('produces the same logical key for `"` on US ANSI and ES ISO, with different codes', () => {
    const us = toKeyInput(event({ key: '"', code: "Quote", shiftKey: true }), 1);
    const es = toKeyInput(event({ key: '"', code: "Digit2", shiftKey: true }), 1);
    expect(us).toMatchObject({ key: '"', code: "Quote" });
    expect(es).toMatchObject({ key: '"', code: "Digit2" });
    expect(us?.key).toBe(es?.key);
  });

  it("treats AltGr characters on ES ISO as plain characters, not command chords", () => {
    const windowsAltGr = event({
      key: "{",
      code: "Quote",
      ctrlKey: true,
      altKey: true,
      getModifierState: (name) => name === "AltGraph",
    });
    expect(toKeyInput(windowsAltGr, 1)).toMatchObject({ key: "{", ctrl: false, alt: false });
  });

  it("still reports real Ctrl chords", () => {
    expect(toKeyInput(event({ key: "r", code: "KeyR", ctrlKey: true }), 1)).toMatchObject({
      key: "r",
      ctrl: true,
    });
  });

  it("preserves arrow keys so they can be recorded even though the engine rejects them", () => {
    expect(toKeyInput(event({ key: "ArrowLeft", code: "ArrowLeft" }), 1)).toMatchObject({
      key: "ArrowLeft",
    });
  });

  it.each(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Dead", "Process", "Tab"])(
    "ignores %s",
    (key) => {
      expect(toKeyInput(event({ key, code: key }), 1)).toBeNull();
    },
  );

  it("ignores IME composition", () => {
    expect(toKeyInput(event({ key: "a", code: "KeyA", isComposing: true }), 1)).toBeNull();
  });
});

describe("shouldPreventDefault", () => {
  it("captures printable and editing keys", () => {
    for (const key of ["a", '"', " ", "/", "Escape", "Backspace", "ArrowDown"]) {
      expect(shouldPreventDefault({ key })).toBe(true);
    }
  });

  it("captures Ctrl+r (redo) but no other Ctrl chord", () => {
    expect(shouldPreventDefault({ key: "r", ctrl: true })).toBe(true);
    expect(shouldPreventDefault({ key: "R", ctrl: true })).toBe(true);
    expect(shouldPreventDefault({ key: "t", ctrl: true })).toBe(false);
    expect(shouldPreventDefault({ key: "r", ctrl: true, meta: true })).toBe(false);
  });

  it("leaves browser and OS chords and function keys alone", () => {
    expect(shouldPreventDefault({ key: "w", meta: true })).toBe(false);
    expect(shouldPreventDefault({ key: "d", alt: true })).toBe(false);
    expect(shouldPreventDefault({ key: "F5" })).toBe(false);
  });
});
