import {
  bufferToText,
  createVimState,
  dispatch,
  splitLines,
  type KeyInput,
  type VimState,
} from "@tutor-nvim/vim-engine";
import { describe, expect, it } from "vitest";

import {
  applyWorkspaceAction,
  bufferId,
  createWorkspace,
  dispatchWorkspace,
  WORKSPACE_EDIT_ACTIONS,
  type WorkspaceState,
} from "./index";

/**
 * `edit.insert` (S1, L9): the one action that changes text, and it does so by delegating to
 * `vim-engine`'s INSERT mode, exactly as every editing key already does. The workspace still never
 * edits a buffer itself, and nothing here reads a clock or writes a file.
 */

const FILES: Readonly<Record<string, string>> = { "src/main.ts": "one" };
const INIT = { files: FILES, path: "src/main.ts", cwd: "/project" };

const key = (pressed: string): KeyInput => ({ key: pressed });

const insert = (state: WorkspaceState, text: string) =>
  applyWorkspaceAction(state, "edit.insert", { text });

const apply = (state: WorkspaceState, action: string, options?: { path?: string }) =>
  applyWorkspaceAction(state, action, options).state;

/**
 * The same typing done by hand through `vim-engine`: `i`, the characters (Enter for a newline),
 * then Esc. The workspace has no second answer to "what does typing this do", and this is what it
 * is compared against.
 */
const typedByVim = (text: string, lines: readonly string[] = ["one"]): VimState => {
  let editor = createVimState({ lines: splitLines(lines.join("\n")) });
  editor = dispatch(editor, key("i")).state;
  for (const character of text) {
    editor = dispatch(editor, character === "\n" ? key("Enter") : key(character)).state;
  }
  return dispatch(editor, key("Escape")).state;
};

const typedTextByVim = (text: string, lines: readonly string[] = ["one"]): string =>
  bufferToText(typedByVim(text, lines).buffer);

const textOf = (state: WorkspaceState, path: string): string | undefined => {
  const buffer = state.buffers.find((candidate) => candidate.path === path);
  return buffer === undefined ? undefined : bufferToText(buffer.editor.buffer);
};

describe("edit.insert — typing text is an action", () => {
  it("is one of the actions the engine applies", () => {
    expect(WORKSPACE_EDIT_ACTIONS).toEqual(["edit.insert"]);
  });

  it("types into the active buffer and leaves the editor in NORMAL mode", () => {
    const initial = createWorkspace(INIT);
    const { state, applied } = insert(initial, "// note\n");

    expect(applied).toBe(true);
    const buffer = state.buffers[0];
    if (buffer === undefined) throw new Error("the workspace always has one buffer");
    // Exactly what the editor produces for the same keys: the text, NORMAL mode, and the cursor
    // `Esc` leaves behind.
    const byVim = typedByVim("// note\n");
    expect(bufferToText(buffer.editor.buffer)).toBe(bufferToText(byVim.buffer));
    expect(buffer.editor.mode).toBe("normal");
    expect(buffer.editor.cursor).toEqual(byVim.cursor);
    expect(buffer.modified).toBe(true);
    // The disk is untouched: typing is not saving.
    expect(state.files).toEqual(FILES);
    expect(state.activeBufferId).toBe(bufferId("src/main.ts"));
  });

  it("types several lines where the cursor was", () => {
    const { state } = insert(createWorkspace(INIT), "first\nsecond\n");
    expect(textOf(state, "src/main.ts")).toBe(typedTextByVim("first\nsecond\n"));
    expect(textOf(state, "src/main.ts")?.split("\n")).toEqual(["first", "second", "one"]);
  });

  it("goes through the editor, so one undo takes the whole typing back", () => {
    const typed = insert(createWorkspace(INIT), "two").state;
    // The typing happened first: without it the undo below would pass on an untouched buffer.
    expect(textOf(typed, "src/main.ts")).toBe(typedTextByVim("two"));

    const undone = dispatchWorkspace(typed, key("u")).state;

    expect(textOf(undone, "src/main.ts")).toBe("one");
    expect(undone.buffers[0]?.modified).toBe(false);
  });

  it("refuses a text that types nothing and leaves the state identical", () => {
    const initial = createWorkspace(INIT);
    const { state, applied, reason } = applyWorkspaceAction(initial, "edit.insert", { text: "" });

    expect(applied).toBe(false);
    expect(reason).toBe("edit.insert: the text to type is empty");
    expect(state).toBe(initial);
  });

  it("refuses an insert that names no text at all", () => {
    const initial = createWorkspace(INIT);
    const { state, applied, reason } = applyWorkspaceAction(initial, "edit.insert");

    expect(applied).toBe(false);
    expect(reason).toBe("edit.insert: no text given");
    expect(state).toBe(initial);
  });

  it("types into the buffer a file.new opened, and file.save is what puts it on disk", () => {
    const created = apply(createWorkspace(INIT), "file.new", { path: "src/notes.md" });
    const typed = insert(created, "# TODO").state;

    // The file is not on the simulated disk until it is saved.
    expect(typed.files["src/notes.md"]).toBeUndefined();
    const saved = apply(typed, "file.save");
    expect(saved.files["src/notes.md"]).toBe(typedTextByVim("# TODO", [""]));
    expect(saved.buffers.find((buffer) => buffer.path === "src/notes.md")?.modified).toBe(false);
  });

  it("is pure: the same text on the same state gives the same state", () => {
    const initial = createWorkspace(INIT);
    const before = JSON.stringify(initial);

    const first = insert(initial, "typed").state;
    expect(textOf(first, "src/main.ts")).toBe(typedTextByVim("typed"));
    expect(first).toEqual(insert(initial, "typed").state);
    expect(JSON.stringify(initial)).toBe(before);
  });
});
