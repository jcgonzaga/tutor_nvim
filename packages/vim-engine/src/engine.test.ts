import { describe, expect, it } from "vitest";
import { bufferToText } from "./buffer";
import { createVimState, dispatch, pendingKeys, runKeys } from "./engine";
import { parseKeySequence } from "./keys";
import type { VimState } from "./types";

const JS_LINE = 'const mode = "development";';

function stateFor(text: string, cursor = { line: 0, column: 0 }): VimState {
  return createVimState({ lines: text.split("\n"), cursor });
}

function run(state: VimState, sequence: string): VimState {
  return runKeys(state, parseKeySequence(sequence));
}

describe("INSERT mode transitions", () => {
  it("enters INSERT with `i` without moving the cursor", () => {
    const result = dispatch(stateFor("abc", { line: 0, column: 1 }), { key: "i" });
    expect(result.accepted).toBe(true);
    expect(result.state.mode).toBe("insert");
    expect(result.state.cursor).toEqual({ line: 0, column: 1 });
    expect(bufferToText(result.state.buffer)).toBe("abc");
  });

  it("returns to NORMAL with Escape and steps the cursor back onto the last inserted character", () => {
    const state = run(stateFor("abc", { line: 0, column: 1 }), "iXY<Esc>");
    expect(state.mode).toBe("normal");
    expect(bufferToText(state.buffer)).toBe("aXYbc");
    expect(state.cursor).toEqual({ line: 0, column: 2 });
  });

  it("keeps the cursor at column 0 when leaving INSERT there", () => {
    const state = run(stateFor("abc"), "i<Esc>");
    expect(state.mode).toBe("normal");
    expect(state.cursor).toEqual({ line: 0, column: 0 });
  });

  it("types at the cursor, including past the end of the line and in empty buffers", () => {
    expect(bufferToText(run(stateFor(""), "ihello").buffer)).toBe("hello");
    const appended = run(stateFor("ab", { line: 0, column: 1 }), "iX");
    expect(bufferToText(appended.buffer)).toBe("aXb");
    expect(appended.cursor).toEqual({ line: 0, column: 2 });
  });

  it("inserts layout-composed characters as single keys", () => {
    expect(bufferToText(run(stateFor(""), "iñá€").buffer)).toBe("ñá€");
  });

  it("accepts Escape in NORMAL as a recognized no-op", () => {
    const state = stateFor("abc");
    const result = dispatch(state, { key: "Escape" });
    expect(result.accepted).toBe(true);
    expect(result.state).toEqual(state);
  });

  it("rejects unsupported keys without changing the state", () => {
    const state = stateFor("abc");
    for (const input of [{ key: "z" }, { key: "ArrowLeft" }, { key: "r", ctrl: true }]) {
      const result = dispatch(state, input);
      expect(result.accepted).toBe(false);
      expect(result.state).toEqual(state);
    }
    const arrow = dispatch(run(state, "i"), { key: "ArrowLeft" });
    expect(arrow.accepted).toBe(false);
    expect(arrow.state.mode).toBe("insert");
  });

  it("does not mutate the previous state", () => {
    const before = stateFor("abc");
    const snapshot = structuredClone(before);
    dispatch(dispatch(before, { key: "i" }).state, { key: "x" });
    expect(before).toEqual(snapshot);
  });
});

describe('`ci"`', () => {
  const inString = stateFor(JS_LINE, { line: 0, column: 17 });

  it("tracks the pending command while it is being typed", () => {
    const afterC = dispatch(inString, { key: "c" });
    expect(afterC.accepted).toBe(true);
    expect(afterC.state.pending).toEqual({ kind: "operator", operator: "change" });

    const afterI = dispatch(afterC.state, { key: "i" });
    expect(afterI.accepted).toBe(true);
    expect(afterI.state.pending).toEqual({
      kind: "text-object",
      operator: "change",
      modifier: "inner",
    });
    expect(afterI.state.mode).toBe("normal");
  });

  it("exposes the typed-so-far keys for display", () => {
    expect(pendingKeys(inString.pending)).toBe("");
    expect(pendingKeys(run(inString, "c").pending)).toBe("c");
    expect(pendingKeys(run(inString, "ci").pending)).toBe("ci");
  });

  it("deletes the inner contents and enters INSERT at the opening quote", () => {
    const state = run(inString, 'ci"');
    expect(bufferToText(state.buffer)).toBe('const mode = "";');
    expect(state.mode).toBe("insert");
    expect(state.cursor).toEqual({ line: 0, column: 14 });
    expect(state.pending).toBeNull();
  });

  it.each([13, 14, 24, 25])("works with the cursor at column %i of the string", (column) => {
    const state = run(stateFor(JS_LINE, { line: 0, column }), 'ci"');
    expect(bufferToText(state.buffer)).toBe('const mode = "";');
    expect(state.mode).toBe("insert");
  });

  it("works with the cursor before the string on the line", () => {
    const state = run(stateFor(JS_LINE), 'ci"');
    expect(bufferToText(state.buffer)).toBe('const mode = "";');
  });

  it("inserts replacement text and returns to NORMAL on Escape", () => {
    const typed = run(inString, 'ci"production');
    expect(bufferToText(typed.buffer)).toBe('const mode = "production";');
    expect(typed.mode).toBe("insert");
    expect(typed.cursor).toEqual({ line: 0, column: 24 });

    const done = run(typed, "<Esc>");
    expect(bufferToText(done.buffer)).toBe('const mode = "production";');
    expect(done.mode).toBe("normal");
    expect(done.cursor).toEqual({ line: 0, column: 23 });
  });

  it("only touches the line containing the cursor", () => {
    const state = run(stateFor('a = "x"\nb = "y"', { line: 1, column: 0 }), 'ci"Z<Esc>');
    expect(bufferToText(state.buffer)).toBe('a = "x"\nb = "Z"');
  });

  it("enters INSERT between the quotes of an empty string", () => {
    const state = run(stateFor('x = "";', { line: 0, column: 5 }), 'ci"ab<Esc>');
    expect(bufferToText(state.buffer)).toBe('x = "ab";');
  });

  it("is rejected, and cancels the operator, when there is no string", () => {
    const afterI = run(stateFor("no quotes"), "ci");
    const result = dispatch(afterI, { key: '"' });
    expect(result.accepted).toBe(false);
    expect(result.state.mode).toBe("normal");
    expect(result.state.pending).toBeNull();
    expect(bufferToText(result.state.buffer)).toBe("no quotes");
  });

  it("cancels a pending operator on an unsupported follow-up key", () => {
    const pending = dispatch(inString, { key: "c" }).state;
    const result = dispatch(pending, { key: "z" });
    expect(result.accepted).toBe(false);
    expect(result.state.pending).toBeNull();
  });

  it("cancels a pending command with Escape", () => {
    const state = run(inString, "ci<Esc>");
    expect(state.pending).toBeNull();
    expect(state.mode).toBe("normal");
    expect(bufferToText(state.buffer)).toBe(JS_LINE);
  });

  it("does not treat `i` as an insert after an operator", () => {
    const state = run(inString, "ci");
    expect(state.mode).toBe("normal");
  });

  it("is layout independent: only the logical key matters, not the physical code", () => {
    const us = { key: '"', code: "Quote", shift: true };
    const es = { key: '"', code: "Digit2", shift: true };
    const afterCI = run(inString, "ci");
    expect(dispatch(afterCI, us).state).toEqual(dispatch(afterCI, es).state);
  });
});
