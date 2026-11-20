import {
  bufferToText,
  createVimState,
  dispatch,
  splitLines,
  type KeyInput,
} from "@tutor-nvim/vim-engine";
import { describe, expect, it } from "vitest";

import {
  bufferId,
  createWorkspace,
  dispatchWorkspace,
  runWorkspaceKeys,
  type WorkspaceState,
} from "./index";

/**
 * The claims "Design for T1" makes in prose but the oracle tests only imply: purity, delegation to
 * `vim-engine`, and how paths are matched. Independent verification asked for these.
 */
const key = (pressed: string): KeyInput => ({ key: pressed });
const keys = (text: string): KeyInput[] => [...text].map(key);
const start = (
  path = "a.ts",
  files: Record<string, string> = { "a.ts": "alpha" },
): WorkspaceState => createWorkspace({ files, path, cwd: "/w" });
const command = (state: WorkspaceState, line: string): WorkspaceState =>
  runWorkspaceKeys(state, [...keys(`:${line}`), key("Enter")]);

describe("workspace purity (S4)", () => {
  it("does not mutate or alias the input files", () => {
    const files = Object.freeze({ "a.ts": "alpha" });
    const state = createWorkspace({ files, path: "a.ts", cwd: "/w" });
    expect(state.files).not.toBe(files);
    expect({ ...files }).toEqual({ "a.ts": "alpha" });
  });

  it("never throws on a key it does not know", () => {
    const state = start();
    for (const pressed of ["F1", "Dead", "Unidentified", "", "🎉", "a".repeat(5000), "\u0000"]) {
      expect(typeof dispatchWorkspace(state, key(pressed)).accepted).toBe("boolean");
    }
    expect(dispatchWorkspace(state, { key: "a", ctrl: true }).accepted).toBe(false);
  });

  it("replays the same sequence to the same state", () => {
    const sequence = [...keys(":e b.ts"), key("Enter"), ...keys("x"), ...keys(":w"), key("Enter")];
    const files = { "a.ts": "alpha", "b.ts": "beta" };
    expect(runWorkspaceKeys(start("a.ts", files), sequence)).toEqual(
      runWorkspaceKeys(start("a.ts", files), sequence),
    );
  });
});

describe("workspace delegates editing to vim-engine (S4)", () => {
  it('matches vim-engine on the same buffer for ci"production<Esc>', () => {
    const files = { "a.ts": 'const mode = "development";' };
    let workspace = start("a.ts", files);
    let editor = createVimState({ lines: splitLines(files["a.ts"] ?? "") });
    for (const ch of 'ci"production\u001b') {
      const input = ch === "\u001b" ? key("Escape") : key(ch);
      workspace = dispatchWorkspace(workspace, input).state;
      editor = dispatch(editor, input).state;
    }
    const buffer = workspace.buffers[0];
    expect(buffer).toBeDefined();
    if (buffer === undefined) return;
    expect(bufferToText(buffer.editor.buffer)).toBe('const mode = "production";');
    expect(bufferToText(buffer.editor.buffer)).toBe(bufferToText(editor.buffer));
    expect(buffer.editor.cursor).toEqual(editor.cursor);
    expect(buffer.editor.mode).toBe(editor.mode);
    expect(buffer.modified).toBe(true);
  });

  it("clears modified when undo returns to the file text", () => {
    const state = runWorkspaceKeys(start(), [...keys("x"), ...keys("u")]);
    expect(
      bufferToText(state.buffers[0]?.editor.buffer ?? createVimState({ lines: [] }).buffer),
    ).toBe("alpha");
    expect(state.buffers[0]?.modified).toBe(false);
  });

  it("cancels a half-typed operator when the command line opens, as Vim does", () => {
    // `d` alone leaves the editor with a pending operator; `:` must clear it, not leave it armed
    // behind a saved file.
    const state = runWorkspaceKeys(start(), [...keys("d"), ...keys(":w"), key("Enter")]);
    expect(state.buffers[0]?.editor.pending).toBeNull();
    expect(state.lastCommand?.accepted).toBe(true);
  });
});

describe("workspace paths and files (S4)", () => {
  it("opens an off-disk starting path as an empty buffer, and :w creates it", () => {
    const fresh = start("new.ts", {});
    expect(fresh.buffers[0]?.id).toBe(bufferId("new.ts"));
    expect(
      bufferToText(fresh.buffers[0]?.editor.buffer ?? createVimState({ lines: [] }).buffer),
    ).toBe("");
    expect(fresh.buffers[0]?.modified).toBe(false);
    const saved = runWorkspaceKeys(fresh, [
      ...keys("ihello"),
      key("Escape"),
      ...keys(":w"),
      key("Enter"),
    ]);
    expect(saved.files["new.ts"]).toBe("hello");
    expect(command(saved, "e new.ts").buffers).toHaveLength(1);
  });

  it("matches paths verbatim, without cwd resolution or normalisation", () => {
    const state = start("a.ts", { "a.ts": "alpha" });
    const rejected = command(state, "e ./a.ts");
    expect(rejected.lastCommand).toEqual({
      command: "e ./a.ts",
      accepted: false,
      output: [],
      reason: "E484: Can't open file ./a.ts",
    });
    expect(rejected.buffers).toBe(state.buffers);
  });
});
