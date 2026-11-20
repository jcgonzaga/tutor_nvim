import { describe, expect, it } from "vitest";

import {
  applyWorkspaceAction,
  bufferId,
  createWorkspace,
  dispatchWorkspace,
  runWorkspaceKeys,
  windowPaths,
  workspaceObjectiveView,
  WORKSPACE_ACTIONS,
  WORKSPACE_EDIT_ACTIONS,
  WORKSPACE_FILE_ACTIONS,
  WORKSPACE_PICKER_ACTIONS,
  WORKSPACE_SESSION_ACTIONS,
  WORKSPACE_TERMINAL_ACTIONS,
  type WindowNode,
  type WorkspaceActionOptions,
  type WorkspaceState,
  type WorkspaceTerminalDeclaration,
} from "./index";

/**
 * The session and the input mode (T7a2, stories 17, 18 and 20).
 *
 * Detaching freezes the workspace: every tab, tree, buffer, terminal, zoom and search stays in the
 * state behind `detached`, and nothing but attaching and detaching reaches it, so a learner who
 * comes back finds exactly what they left. Moving a window between tabs changes which tab holds
 * what and never empties the one it left, because a workspace is never nobody's. Resize mode is an
 * input mode and not a layout: while it is on, only resizing and leaving it apply, and leaving it
 * keeps what was resized.
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

/** The declared outputs of the simulated machine: the exercise owns this text (S6). */
const TERMINAL: WorkspaceTerminalDeclaration = {
  title: "dev",
  cwd: CWD,
  commands: { "npm test": ["Tests: 3 passed"] },
};

const INIT = { files: FILES, path: MAIN, cwd: CWD, terminal: TERMINAL };

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

const key = (pressed: string) => ({ key: pressed });
/** Types `:command` and presses Enter: the T1 command line, unchanged by the window tree. */
const command = (state: WorkspaceState, line: string): WorkspaceState =>
  runWorkspaceKeys(state, [[...`:${line}`].map(key), [key("Enter")]].flat());

const leaf = (path: string): WindowNode => ({ kind: "leaf", bufferId: bufferId(path) });
const terminalLeaf = (terminalId: string): WindowNode => ({ kind: "terminal", terminalId });
const splitNode = (
  layout: "side-by-side" | "stacked",
  ratio: number,
  first: WindowNode,
  second: WindowNode,
): WindowNode => ({ kind: "split", layout, ratio, first, second });

/**
 * A workspace worth freezing: `tab:1` is `side(leaf main, side(leaf format, terminal))` with the
 * terminal focused, zoomed, holding a declared command's output; `tab:2` is one window on the
 * format file; the keys are back in `tab:1` and a project search has recorded its rows.
 *
 * Story 20 says the editor is *still open* when the learner reattaches, so the fixture carries one
 * of everything the freeze must not lose.
 */
function busy(): WorkspaceState {
  const split = command(apply(initial(), "window.split-side-by-side"), "e src/lib/format.ts");
  const launched = apply(split, "app.launch-terminal");
  const ran = apply(launched, "shell.run", { command: "npm test" });
  const zoomed = apply(ran, "window.zoom");
  const twoTabs = command(apply(zoomed, "tab.new"), "e src/lib/format.ts");
  const back = apply(twoTabs, "workspace.switch", { tabId: "tab:1" });
  return apply(back, "grep.project", { query: "mode" });
}

/**
 * Two tabs, the keys back in the first one: `tab:1` is `side(leaf main, leaf format)` focused on the
 * format pane and `tab:2` is one window on the main file. A window moving out of `tab:1` therefore
 * has a tab to leave and a tab to arrive in, which is story 17 in one line.
 */
function twoTabs(): WorkspaceState {
  const split = command(apply(initial(), "window.split-side-by-side"), "e src/lib/format.ts");
  const second = command(apply(split, "tab.new"), "e src/main.ts");
  return apply(second, "workspace.switch", { tabId: "tab:1" });
}

/** Every action of the vocabulary the engine applies: what a frozen or resizing state must refuse. */
const EVERY_ACTION: readonly string[] = [
  ...WORKSPACE_ACTIONS,
  ...WORKSPACE_FILE_ACTIONS,
  ...WORKSPACE_PICKER_ACTIONS,
  ...WORKSPACE_EDIT_ACTIONS,
  ...WORKSPACE_TERMINAL_ACTIONS,
];

/** The options a well-formed action of each kind would carry, so a refusal is never about them. */
const ANY_OPTIONS: WorkspaceActionOptions = {
  tabId: "tab:2",
  path: MAIN,
  text: "x",
  query: "mode",
  command: "npm test",
};

/**
 * The actions resize mode lets through (T7a2 design): resizing, leaving it and detaching. Entering it
 * again is let through so the action itself can say it is already in the mode, which is a refusal
 * with its own reason rather than the mode's generic one.
 */
const RESIZE_MODE_ALLOWED: readonly string[] = [
  "window.enter-resize-mode",
  "window.resize-wider",
  "window.resize-narrower",
  "window.resize-taller",
  "window.resize-shorter",
  "window.leave-resize-mode",
  "session.detach",
];

describe("session.detach and session.attach — the workspace frozen, then found again", () => {
  it("lists the session actions the engine applies", () => {
    expect([...WORKSPACE_SESSION_ACTIONS]).toEqual(["session.detach", "session.attach"]);
  });

  it("sets the flag and changes nothing else: tabs, buffers, terminal and zoom stay as they were", () => {
    const before = busy();
    const { state, applied } = act(before, "session.detach");

    expect(applied).toBe(true);
    expect(state.detached).toBe(true);
    // The same workspace, not a copy of it: detaching freezes, it does not rebuild.
    expect(state.tabs).toBe(before.tabs);
    expect(state.buffers).toBe(before.buffers);
    expect(state.terminals).toBe(before.terminals);
    expect(state.matches).toBe(before.matches);
    expect(state.zoom).toEqual({ tabId: "tab:1", leafPath: ["second", "second"] });
    expect(state.terminals[0]?.entries).toEqual([
      { command: "npm test", output: ["Tests: 3 passed"] },
    ]);
    expect(state.activeTabId).toBe("tab:1");
    expect(state.activeBufferId).toBe(before.activeBufferId);
  });

  it("refuses every other action, naming the state, before it has any effect", () => {
    const detached = apply(busy(), "session.detach");
    const frozen = JSON.stringify(detached);

    for (const action of EVERY_ACTION) {
      const result = act(detached, action, ANY_OPTIONS);
      expect(result.applied).toBe(false);
      expect(result.reason).toBe(`${action}: the session is detached; attach to it first`);
      // The state it was given, unchanged: a refused action wrote nothing at all.
      expect(result.state).toBe(detached);
    }
    expect(JSON.stringify(detached)).toBe(frozen);
  });

  it("restores exactly what was frozen when the session is attached again", () => {
    const before = busy();
    const restored = act(apply(before, "session.detach"), "session.attach");

    expect(restored.applied).toBe(true);
    expect(restored.state.detached).toBe(false);
    expect(restored.state).toEqual(before);
  });

  it("finds the editor still open, with the text typed before the freeze", () => {
    // Story 20: detach, reattach, and the buffer you were editing is the buffer you find. `busy()`
    // leaves the keys on the terminal, whose prompt now takes them (T7a3), so the editing happens
    // where the learner would do it: after moving focus back to the file window.
    const editor = apply(busy(), "window.focus-left");
    const typed = runWorkspaceKeys(editor, [key("x")]);
    const edited = typed.buffers.find((buffer) => buffer.id === typed.activeBufferId);
    expect(edited?.modified).toBe(true);

    const back = apply(apply(typed, "session.detach"), "session.attach");

    expect(back).toEqual(typed);
    expect(back.buffers.find((buffer) => buffer.id === typed.activeBufferId)?.modified).toBe(true);
  });

  it("detaches and attaches again even when the freeze happened in resize mode", () => {
    // The freeze is the outer state, so the mode it was left in is what attaching finds, not a lock
    // the learner can never open again.
    const detached = apply(apply(twoTabs(), "window.enter-resize-mode"), "session.detach");
    const attached = act(detached, "session.attach");

    expect(attached.applied).toBe(true);
    expect(attached.state.detached).toBe(false);
    expect(attached.state.mode).toBe("resize");
  });

  it("is pure: the same detach on the same workspace gives the same state", () => {
    const before = busy();
    const frozen = JSON.stringify(before);

    expect(apply(before, "session.detach")).toEqual(apply(before, "session.detach"));
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe("workspace.move — a window into another tab", () => {
  it("moves the focused window into the other tab as a split of its root", () => {
    const { state, applied } = act(twoTabs(), "workspace.move", { tabId: "tab:2" });

    expect(applied).toBe(true);
    expect(state.tabs).toEqual([
      // The source tab keeps the window beside it, and stays a tab: a workspace is never nobody's.
      { id: "tab:1", root: leaf(MAIN), focus: [] },
      {
        id: "tab:2",
        root: splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)),
        focus: ["first"],
      },
    ]);
    // The keys stay in the tab the window came from; `workspace.switch` is what brings you back.
    expect(state.activeTabId).toBe("tab:1");
    expect(state.activeBufferId).toBe(bufferId(MAIN));
    // A window moved, no file was closed: the buffers are the ones that were open.
    expect(state.buffers.map((buffer) => buffer.path)).toEqual([MAIN, FORMAT]);
  });

  it("moves the leaf it is told to, not the split the leaf sits in", () => {
    // `side(leaf main, stacked(leaf format, leaf format))`, the deepest pane focused.
    const nested = apply(twoTabs(), "window.split-stacked");
    const moved = apply(nested, "workspace.move", { tabId: "tab:2" });

    expect(moved.tabs[0]).toEqual({
      id: "tab:1",
      root: splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)),
      focus: ["second"],
    });
    expect(moved.tabs[1]?.root).toEqual(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)));
  });

  it("moves a terminal window like any other window, and drops the zoom that named it", () => {
    // `busy()` focuses the terminal leaf of `tab:1` and the zoom names that very leaf.
    const moved = apply(busy(), "workspace.move", { tabId: "tab:2" });

    expect(moved.tabs[1]?.root).toEqual(
      splitNode("side-by-side", 0.5, leaf(FORMAT), terminalLeaf("terminal:1")),
    );
    expect(windowPaths(moved)).toEqual([MAIN, FORMAT]);
    // The session is still open and still holds what it printed.
    expect(moved.terminals[0]?.entries).toEqual([
      { command: "npm test", output: ["Tests: 3 passed"] },
    ]);
    // A zoom names a window in a tab; the window left that tab, so nothing is zoomed any more.
    expect(moved.zoom).toBeNull();
  });

  it("shows the tab that now holds the window when switching back to it", () => {
    const moved = apply(twoTabs(), "workspace.move", { tabId: "tab:2" });
    const back = apply(moved, "workspace.switch", { tabId: "tab:2" });

    expect(back.activeTabId).toBe("tab:2");
    expect(windowPaths(back)).toEqual([MAIN, FORMAT]);
    expect(workspaceObjectiveView(back).layout).toBe("side(leaf, leaf)");
    // The moved window arrived before the one that was already there, so the keys land on main.
    expect(back.activeBufferId).toBe(bufferId(MAIN));
  });

  it("refuses a move to the tab the window is already in", () => {
    const before = twoTabs();
    const { state, applied, reason } = act(before, "workspace.move", { tabId: "tab:1" });

    expect(applied).toBe(false);
    expect(reason).toBe("workspace.move: the focused window is already in tab:1");
    expect(state).toBe(before);
  });

  it("refuses a move that would empty the source tab", () => {
    // `tab:2` holds a single window: moving it would leave a workspace nobody is in.
    const single = apply(twoTabs(), "workspace.switch", { tabId: "tab:2" });
    const { state, applied, reason } = act(single, "workspace.move", { tabId: "tab:1" });

    expect(applied).toBe(false);
    expect(reason).toBe(
      "workspace.move: the source tab holds a single window, so moving it would leave it empty",
    );
    expect(state).toBe(single);
  });

  it("refuses an unknown target tab, and a move that names none", () => {
    const before = twoTabs();

    const unknown = act(before, "workspace.move", { tabId: "tab:9" });
    expect(unknown.applied).toBe(false);
    expect(unknown.reason).toBe("workspace.move: no tab named tab:9");
    expect(unknown.state).toBe(before);

    const none = act(before, "workspace.move");
    expect(none.applied).toBe(false);
    expect(none.reason).toBe("workspace.move: no tab given");
    expect(none.state).toBe(before);
  });

  it("is deterministic: the same move twice gives the same workspace", () => {
    expect(apply(twoTabs(), "workspace.move", { tabId: "tab:2" })).toEqual(
      apply(twoTabs(), "workspace.move", { tabId: "tab:2" }),
    );
  });
});

describe("resize mode — an input mode that refuses everything but resizing", () => {
  it("enters and leaves, as a field of the state and not a shape of the tree", () => {
    const before = twoTabs();
    const resizing = apply(before, "window.enter-resize-mode");

    expect(resizing.mode).toBe("resize");
    // A mode is not a layout: entering it changes nothing about the windows.
    expect(resizing.tabs).toBe(before.tabs);

    const left = apply(resizing, "window.leave-resize-mode");
    expect(left.mode).toBe("normal");
    expect(left.tabs).toBe(before.tabs);
  });

  it("keeps the tree normal on a fresh workspace", () => {
    expect(initial().mode).toBe("normal");
    expect(initial().detached).toBe(false);
  });

  it("applies the resize actions and keeps what they widened", () => {
    const resizing = apply(twoTabs(), "window.enter-resize-mode");
    const wider = apply(resizing, "window.resize-wider");

    expect(wider.tabs[0]?.root).toMatchObject({ ratio: 0.55 });
    // Resizing does not leave the mode by itself.
    expect(wider.mode).toBe("resize");

    const left = apply(wider, "window.leave-resize-mode");
    expect(left.mode).toBe("normal");
    // "Widen a window in resize mode, then leave it" ends with the wider ratio still there.
    expect(left.tabs[0]?.root).toMatchObject({ ratio: 0.55 });
  });

  it("refuses every other action while in resize mode, naming the mode", () => {
    const resizing = apply(twoTabs(), "window.enter-resize-mode");
    const frozen = JSON.stringify(resizing);

    for (const action of [...EVERY_ACTION, "session.attach"]) {
      if (RESIZE_MODE_ALLOWED.includes(action)) continue;
      const result = act(resizing, action, ANY_OPTIONS);
      expect(result.applied).toBe(false);
      expect(result.reason).toBe(`${action}: the workspace is in resize mode; leave it first`);
      expect(result.state).toBe(resizing);
    }
    expect(JSON.stringify(resizing)).toBe(frozen);
    // Detaching is still reachable from resize mode: the freeze is never a dead end.
    expect(act(resizing, "session.detach").applied).toBe(true);
  });

  it("refuses entering when it is already in resize mode", () => {
    const resizing = apply(twoTabs(), "window.enter-resize-mode");
    const { state, applied, reason } = act(resizing, "window.enter-resize-mode");

    expect(applied).toBe(false);
    expect(reason).toBe("window.enter-resize-mode: the workspace is already in resize mode");
    expect(state).toBe(resizing);
  });

  it("refuses leaving when it is not in resize mode", () => {
    const before = twoTabs();
    const { state, applied, reason } = act(before, "window.leave-resize-mode");

    expect(applied).toBe(false);
    expect(reason).toBe("window.leave-resize-mode: the workspace is not in resize mode");
    expect(state).toBe(before);
  });
});

/**
 * The keys of a terminal's own command line (T7a3) are the keys of a terminal action in the making,
 * so the two states that freeze input refuse them exactly as they refuse `shell.run`: the same gate
 * answers both, with the same words, and a refused key leaves the workspace untouched.
 */
describe("a frozen or resizing workspace refuses the terminal's keys", () => {
  const launched = (): WorkspaceState => apply(initial(), "app.launch-terminal");

  it("refuses every prompt key while the session is detached, with shell.run's own refusal", () => {
    const detached = apply(launched(), "session.detach");

    for (const pressed of ["l", "Backspace", "Escape", "Enter"]) {
      const { state, accepted, reason } = dispatchWorkspace(detached, key(pressed));
      expect(accepted).toBe(false);
      expect(reason).toBe("shell.run: the session is detached; attach to it first");
      expect(state).toBe(detached);
    }
    // The action says the same thing because both ask the same gate, not because both spell it out.
    expect(act(detached, "shell.run", { command: "npm test" }).reason).toBe(
      "shell.run: the session is detached; attach to it first",
    );
  });

  it("refuses every prompt key in resize mode, with shell.run's own refusal", () => {
    const resizing = apply(launched(), "window.enter-resize-mode");

    for (const pressed of ["l", "Backspace", "Escape", "Enter"]) {
      const { state, accepted, reason } = dispatchWorkspace(resizing, key(pressed));
      expect(accepted).toBe(false);
      expect(reason).toBe("shell.run: the workspace is in resize mode; leave it first");
      expect(state).toBe(resizing);
    }
    expect(act(resizing, "shell.run", { command: "npm test" }).reason).toBe(
      "shell.run: the workspace is in resize mode; leave it first",
    );
  });

  it("types again once the session is attached and the mode left", () => {
    const frozen = apply(apply(launched(), "window.enter-resize-mode"), "session.detach");
    const back = apply(apply(frozen, "session.attach"), "window.leave-resize-mode");
    const { state, accepted } = dispatchWorkspace(back, key("l"));

    expect(accepted).toBe(true);
    expect(state.terminals[0]?.pending).toBe("l");
  });
});

/**
 * A frozen workspace is frozen for the keyboard too.
 *
 * The gate that refuses an action while detached or resizing has to stand in front of the keys, or a
 * learner could edit the buffer of a session they cannot even see: `:` would still open, `x` would
 * still delete and the tree would still move. The key path asks the same question the action path
 * asks, so the two cannot answer differently.
 */
describe("a frozen or resizing workspace refuses the editor's keys", () => {
  it("refuses a buffer key while the session is detached, naming the state", () => {
    const detached = apply(initial(), "session.detach");

    for (const pressed of ["x", "i", ":"]) {
      const { state, accepted, reason } = dispatchWorkspace(detached, key(pressed));
      expect(accepted).toBe(false);
      expect(reason).toBe("typing: the session is detached; attach to it first");
      expect(state).toBe(detached);
    }
    expect(workspaceObjectiveView(detached).buffers[0]?.text).toBe(MAIN_TEXT);
  });

  it("refuses a buffer key in resize mode, naming the mode", () => {
    const resizing = apply(initial(), "window.enter-resize-mode");

    for (const pressed of ["x", "i", ":"]) {
      const { state, accepted, reason } = dispatchWorkspace(resizing, key(pressed));
      expect(accepted).toBe(false);
      expect(reason).toBe("typing: the workspace is in resize mode; leave it first");
      expect(state).toBe(resizing);
    }
  });

  it("edits again once the session is attached and the mode left", () => {
    const frozen = apply(apply(initial(), "window.enter-resize-mode"), "session.detach");
    const back = apply(apply(frozen, "session.attach"), "window.leave-resize-mode");

    const { state, accepted } = dispatchWorkspace(back, key("x"));
    expect(accepted).toBe(true);
    expect(workspaceObjectiveView(state).buffers[0]?.text).not.toBe(MAIN_TEXT);
  });
});
