import { describe, expect, it } from "vitest";

import {
  applyWorkspaceAction,
  bufferId,
  createWorkspace,
  windowPaths,
  WORKSPACE_TERMINAL_ACTIONS,
  type WindowNode,
  type WorkspaceActionOptions,
  type WorkspaceState,
  type WorkspaceTerminalDeclaration,
} from "./index";

/**
 * A terminal is a window that shows a session, not a file (S6, T7a1, stories 15 and 19).
 *
 * The exercise declares what the simulated machine prints (`initialState.terminal`), because there
 * is no process to ask (S6): `shell.run` looks the command up, appends the entry and returns the
 * state, and a command nobody declared is refused with its name instead of invented text. A
 * terminal leaf is a leaf, so focus, split, zoom, resize, swap and close work on it with no special
 * case, and `open_buffers` keeps meaning "what is loaded".
 */

const MAIN_TEXT = 'const mode = "development";';
const FORMAT_TEXT = "export const format = (value: number) => String(value);";
const FILES: Readonly<Record<string, string>> = {
  "src/main.ts": MAIN_TEXT,
  "src/lib/format.ts": FORMAT_TEXT,
};
const MAIN = "src/main.ts";
const FORMAT = "src/lib/format.ts";
const CWD = "/project";

/** The declared outputs of the simulated machine: the exercise owns this text. */
const TERMINAL: WorkspaceTerminalDeclaration = {
  title: "dev",
  cwd: CWD,
  commands: {
    "npm test": ["PASS src/main.test.ts", "Tests: 3 passed"],
    ls: ["src", "package.json"],
  },
};

const INIT = { files: FILES, path: MAIN, cwd: CWD, terminal: TERMINAL };
/** The same workspace without a declaration: an exercise that never opens a terminal. */
const NO_TERMINAL = { files: FILES, path: MAIN, cwd: CWD };

const initial = (): WorkspaceState => createWorkspace(INIT);

const act = (state: WorkspaceState, action: string, options?: WorkspaceActionOptions) =>
  applyWorkspaceAction(state, action, options);

/** Applies an action that must apply; a refusal here is a bug in the test, not a tolerated result. */
function apply(
  state: WorkspaceState,
  action: string,
  options?: WorkspaceActionOptions,
): WorkspaceState {
  const result = act(state, action, options);
  if (!result.applied) throw new Error(`${action} was refused: ${result.reason ?? "no reason"}`);
  return result.state;
}

const bufferLeaf = (path: string): WindowNode => ({ kind: "leaf", bufferId: bufferId(path) });
const terminalLeaf = (terminalId: string): WindowNode => ({ kind: "terminal", terminalId });

describe("app.launch-terminal — a terminal is a window", () => {
  it("is one of the actions the engine applies", () => {
    expect([...WORKSPACE_TERMINAL_ACTIONS]).toEqual(["app.launch-terminal", "shell.run"]);
  });

  it("opens a terminal leaf beside the focused window and focuses it", () => {
    const { state, applied } = act(initial(), "app.launch-terminal");

    expect(applied).toBe(true);
    // One session, opened from the declaration the exercise owns: no process ran (S6).
    expect(state.terminals).toEqual([{ id: "terminal:1", title: "dev", cwd: CWD, entries: [] }]);
    expect(state.tabs[0]?.root).toEqual({
      kind: "split",
      layout: "side-by-side",
      ratio: 0.5,
      first: bufferLeaf(MAIN),
      second: terminalLeaf("terminal:1"),
    });
    expect(state.tabs[0]?.focus).toEqual(["second"]);
    // A terminal window shows a session, not a file, so no buffer is focused and none is loaded.
    expect(state.buffers.map((buffer) => buffer.path)).toEqual([MAIN]);
    expect(state.activeBufferId).toBe(bufferId(MAIN));
  });

  it("refuses when the exercise declares no terminal, naming what is missing", () => {
    const before = createWorkspace(NO_TERMINAL);
    const { state, applied, reason } = act(before, "app.launch-terminal");

    expect(applied).toBe(false);
    expect(reason).toBe("app.launch-terminal: the exercise declares no terminal");
    expect(state).toBe(before);
  });

  it("opens in the workspace cwd when the declaration names none", () => {
    const declared = { ...TERMINAL, cwd: null };
    const state = apply(
      createWorkspace({ ...INIT, cwd: "/srv/app", terminal: declared }),
      "app.launch-terminal",
    );
    expect(state.terminals[0]?.cwd).toBe("/srv/app");
  });

  it("gives a second launch its own session instead of reusing the first one", () => {
    const twice = apply(apply(initial(), "app.launch-terminal"), "app.launch-terminal");

    expect(twice.terminals.map((terminal) => terminal.id)).toEqual(["terminal:1", "terminal:2"]);
    expect(twice.tabs[0]?.root).toEqual({
      kind: "split",
      layout: "side-by-side",
      ratio: 0.5,
      first: bufferLeaf(MAIN),
      second: {
        kind: "split",
        layout: "side-by-side",
        ratio: 0.5,
        first: terminalLeaf("terminal:1"),
        second: terminalLeaf("terminal:2"),
      },
    });
    expect(twice.tabs[0]?.focus).toEqual(["second", "second"]);
  });

  it("is a window like any other: focus moves off it and close leaves the session open", () => {
    const launched = apply(initial(), "app.launch-terminal");

    const left = apply(launched, "window.focus-left");
    expect(left.tabs[0]?.focus).toEqual(["first"]);
    expect(left.activeBufferId).toBe(bufferId(MAIN));

    const closed = apply(launched, "window.close");
    expect(closed.tabs[0]).toEqual({ id: "tab:1", root: bufferLeaf(MAIN), focus: [] });
    // Closing the window does not end the session, exactly as closing a buffer keeps the file.
    expect(closed.terminals).toHaveLength(1);
  });

  it("resizes, zooms and swaps on a terminal leaf without a special case", () => {
    const launched = apply(initial(), "app.launch-terminal");

    const wider = apply(launched, "window.resize-wider");
    expect(wider.tabs[0]?.root).toMatchObject({ ratio: 0.55 });

    const zoomed = apply(wider, "window.zoom");
    expect(zoomed.zoom).toEqual({ tabId: "tab:1", leafPath: ["second"] });
    // The tree is untouched by a zoom, so both windows still print.
    expect(windowPaths(zoomed)).toEqual([MAIN, "terminal:dev"]);

    // The focused terminal leaf trades places with the file beside it: the tree, not the buffers.
    const swapped = apply(launched, "window.swap");
    expect(swapped.tabs[0]?.root).toMatchObject({
      first: { kind: "terminal", terminalId: "terminal:1" },
      second: { kind: "leaf", bufferId: bufferId(MAIN) },
    });
    expect(swapped.tabs[0]?.focus).toEqual(["second"]);
    expect(swapped.activeBufferId).toBe(bufferId(MAIN));
  });

  it("opens a file in the terminal's window without touching the pane beside it", () => {
    const launched = apply(initial(), "app.launch-terminal");
    const opened = apply(launched, "file.open", { path: FORMAT });

    // `:e` in a window replaces what that window shows; the neighbour keeps its file.
    expect(windowPaths(opened)).toEqual([MAIN, FORMAT]);
    expect(opened.buffers.map((buffer) => buffer.path)).toEqual([MAIN, FORMAT]);
    expect(opened.activeBufferId).toBe(bufferId(FORMAT));
  });

  it("is pure: the same declaration on the same state gives the same workspace", () => {
    const before = initial();
    const frozen = JSON.stringify(before);

    const first = apply(before, "app.launch-terminal");
    expect(first).toEqual(apply(before, "app.launch-terminal"));
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

/**
 * A terminal window has no buffer behind it, so the actions that write through the active buffer have
 * nowhere to go while it is focused (T7a2). They are refused with a reason instead of editing a file
 * the learner cannot see, and the file keeps editing normally once focus is back on it.
 */
describe("editing has nowhere to go while a terminal is focused", () => {
  const launched = (): WorkspaceState => apply(initial(), "app.launch-terminal");

  it("refuses edit.insert, naming the terminal that has the keys", () => {
    const before = launched();
    const { state, applied, reason } = act(before, "edit.insert", { text: "hello" });

    expect(applied).toBe(false);
    expect(reason).toBe(
      "edit.insert: the focused window is a terminal, so there is no buffer to edit",
    );
    expect(state).toBe(before);
  });

  it("refuses file.save even when a buffer elsewhere has unsaved changes", () => {
    // The buffer really is modified: the file window was edited before the terminal took the keys.
    const edited = apply(apply(launched(), "window.focus-left"), "edit.insert", { text: "x" });
    expect(edited.buffers[0]?.modified).toBe(true);
    const terminal = apply(edited, "app.launch-terminal");

    const saved = act(terminal, "file.save");
    expect(saved.applied).toBe(false);
    expect(saved.reason).toBe(
      "file.save: the focused window is a terminal, so there is no buffer to save",
    );
    expect(saved.state).toBe(terminal);
  });

  it("refuses file.close-buffer, so a session cannot unload a file it does not show", () => {
    const before = launched();
    const { state, applied, reason } = act(before, "file.close-buffer");

    expect(applied).toBe(false);
    expect(reason).toBe(
      "file.close-buffer: the focused window is a terminal, so there is no buffer to close",
    );
    expect(state).toBe(before);
  });

  it("edits and saves normally again once a file window has the keys", () => {
    const edited = apply(apply(launched(), "window.focus-left"), "edit.insert", { text: "x" });
    const terminal = apply(edited, "app.launch-terminal");
    const backToFile = apply(terminal, "window.focus-left");

    const saved = act(backToFile, "file.save");
    expect(saved.applied).toBe(true);
    expect(saved.state.files[MAIN]).toBe(`x${MAIN_TEXT}`);

    const typed = act(saved.state, "edit.insert", { text: "y" });
    expect(typed.applied).toBe(true);
    expect(typed.state.buffers[0]?.modified).toBe(true);
  });
});

describe("shell.run — the output the exercise declared, appended", () => {
  const launched = (): WorkspaceState => apply(initial(), "app.launch-terminal");

  it("appends the declared entry to the focused terminal and changes nothing else", () => {
    const before = launched();
    const { state, applied } = act(before, "shell.run", { command: "npm test" });

    expect(applied).toBe(true);
    expect(state.terminals[0]?.entries).toEqual([
      { command: "npm test", output: ["PASS src/main.test.ts", "Tests: 3 passed"] },
    ]);
    // The workspace is the same one: same files, same buffers, same tree, same focus.
    expect(state.files).toBe(before.files);
    expect(state.buffers).toBe(before.buffers);
    expect(state.tabs).toBe(before.tabs);
    expect(state.activeBufferId).toBe(before.activeBufferId);
  });

  it("keeps the entries in the order they ran, so a scrollback is what a story reads", () => {
    const ran = apply(apply(launched(), "shell.run", { command: "ls" }), "shell.run", {
      command: "npm test",
    });
    expect(ran.terminals[0]?.entries.map((entry) => entry.command)).toEqual(["ls", "npm test"]);
  });

  it("refuses a command whose output the exercise never declared", () => {
    const before = launched();
    const { state, applied, reason } = act(before, "shell.run", { command: "rm -rf /" });

    expect(applied).toBe(false);
    expect(reason).toBe('shell.run: no output is declared for "rm -rf /"');
    expect(state).toBe(before);
  });

  it("refuses when the focused window is not a terminal", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "shell.run", { command: "npm test" });

    expect(applied).toBe(false);
    expect(reason).toBe("shell.run: the focused window is not a terminal");
    expect(state).toBe(before);
  });

  it("refuses a shell.run that names no command at all", () => {
    const before = launched();
    const { state, applied, reason } = act(before, "shell.run");

    expect(applied).toBe(false);
    expect(reason).toBe("shell.run: no command given");
    expect(state).toBe(before);
  });

  it("is deterministic: the same command twice gives the same state", () => {
    const first = apply(launched(), "shell.run", { command: "ls" });
    const second = apply(launched(), "shell.run", { command: "ls" });
    expect(first).toEqual(second);
  });
});
