import { bufferToText, type KeyInput } from "@tutor-nvim/vim-engine";
import { describe, expect, it } from "vitest";

import {
  activeTab,
  applyWorkspaceAction,
  bufferId,
  createWorkspace,
  dispatchWorkspace,
  focusedNode,
  leafBufferIds,
  runWorkspaceKeys,
  WORKSPACE_ACTIONS,
  WORKSPACE_FILE_ACTIONS,
  WORKSPACE_PICKER_ACTIONS,
  type WindowNode,
  type WorkspaceActionOptions,
  type WorkspaceGrepMatch,
  type WorkspaceState,
} from "./index";

/**
 * Oracle tests for the window tree (S2, S4): every action is applied to a state and the *whole*
 * resulting state is asserted — files, the open buffers, which one is active, every tab's tree and
 * focus path, the active tab, the zoom. A window operation is an action, never a key, so nothing
 * here knows a prefix or a leader (the layer catalogs own those, `packages/keymap`).
 *
 * A split shows the active buffer in both panes, which is what tmux and nvim do (stories 9 and 10);
 * the invariant suite therefore asserts that a buffer is *registered* once, not that it is shown
 * once.
 */

const MAIN_TEXT = 'const mode = "development";';
const FORMAT_TEXT = "export const format = (value: number) => String(value);";
const README_TEXT = "# workspace";

const FILES: Readonly<Record<string, string>> = {
  "src/main.ts": MAIN_TEXT,
  "src/lib/format.ts": FORMAT_TEXT,
  "README.md": README_TEXT,
};
const CWD = "/home/user/project";
const MAIN = "src/main.ts";
const FORMAT = "src/lib/format.ts";
const README = "README.md";
const INIT = { files: FILES, path: MAIN, cwd: CWD };

interface BufferSnapshot {
  readonly id: string;
  readonly path: string;
  readonly text: string;
  readonly cursor: { readonly line: number; readonly column: number };
  readonly mode: string;
  readonly modified: boolean;
}

interface TabSnapshot {
  readonly id: string;
  readonly root: WindowNode;
  readonly focus: readonly string[];
}

interface Snapshot {
  readonly files: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly buffers: readonly BufferSnapshot[];
  readonly activeBufferId: string;
  readonly tabs: readonly TabSnapshot[];
  readonly activeTabId: string;
  readonly zoom: unknown;
  readonly pending: unknown;
  readonly lastCommand: unknown;
  /**
   * The rows of the last project search (T5c). Nothing here searches, so the field is asserted as
   * empty on every window, file and buffer step: a picker must not record rows as a side effect.
   */
  readonly matches: readonly WorkspaceGrepMatch[];
}

const snapshot = (state: WorkspaceState): Snapshot => ({
  files: { ...state.files },
  cwd: state.cwd,
  buffers: state.buffers.map((buffer) => ({
    id: buffer.id,
    path: buffer.path,
    text: bufferToText(buffer.editor.buffer),
    cursor: buffer.editor.cursor,
    mode: buffer.editor.mode,
    modified: buffer.modified,
  })),
  tabs: state.tabs.map((tab) => ({ id: tab.id, root: tab.root, focus: [...tab.focus] })),
  activeBufferId: state.activeBufferId,
  activeTabId: state.activeTabId,
  zoom: state.zoom,
  pending: state.pending,
  lastCommand: state.lastCommand,
  matches: [...state.matches],
});

/** The buffer of a single-line fixture file, as the T1 tests spell it. */
const bufferState = (
  path: string,
  text: string,
  cursor: { line: number; column: number } = { line: 0, column: 0 },
  modified = false,
): BufferSnapshot => ({
  id: bufferId(path),
  path,
  text,
  cursor,
  mode: "normal",
  modified,
});

const leaf = (path: string): WindowNode => ({ kind: "leaf", bufferId: bufferId(path) });
const splitNode = (
  layout: "side-by-side" | "stacked",
  ratio: number,
  first: WindowNode,
  second: WindowNode,
): WindowNode => ({ kind: "split", layout, ratio, first, second });
const tabOf = (root: WindowNode, focus: readonly string[] = []): TabSnapshot => ({
  id: "tab:1",
  root,
  focus,
});

/** Every field of the state, so a test fails on the one it did not list instead of passing by luck. */
const stateOf = (parts: {
  readonly buffers: readonly BufferSnapshot[];
  readonly activeBufferId: string;
  readonly tabs: readonly TabSnapshot[];
  readonly activeTabId?: string;
  readonly zoom?: unknown;
  readonly lastCommand?: unknown;
  readonly files?: Readonly<Record<string, string>>;
  readonly matches?: readonly WorkspaceGrepMatch[];
}): Snapshot => ({
  files: parts.files ?? FILES,
  cwd: CWD,
  buffers: parts.buffers,
  activeBufferId: parts.activeBufferId,
  tabs: parts.tabs,
  activeTabId: parts.activeTabId ?? "tab:1",
  zoom: parts.zoom ?? null,
  pending: null,
  lastCommand: parts.lastCommand ?? null,
  matches: parts.matches ?? [],
});

const key = (pressed: string): KeyInput => ({ key: pressed });
const keysOf = (text: string): KeyInput[] => [...text].map(key);

const initial = (): WorkspaceState => createWorkspace(INIT);
const act = (state: WorkspaceState, action: string, options?: WorkspaceActionOptions) =>
  applyWorkspaceAction(state, action, options);
const apply = (
  state: WorkspaceState,
  action: string,
  options?: WorkspaceActionOptions,
): WorkspaceState => act(state, action, options).state;
/** Types `:command` and presses Enter: the T1 command line, unchanged by the window tree. */
const command = (state: WorkspaceState, line: string): WorkspaceState =>
  runWorkspaceKeys(state, [...keysOf(`:${line}`), key("Enter")]);

const openedFormat = (): WorkspaceState => command(initial(), "e src/lib/format.ts");
/** Two panes side by side, the left one on `src/main.ts` and the focused right one on the format file. */
const sideBySide = (): WorkspaceState =>
  command(apply(initial(), "window.split-side-by-side"), "e src/lib/format.ts");

describe("window.split-* — splitting the focused window", () => {
  it("splits side by side, gives the new pane the active buffer and focuses it", () => {
    const { state, applied } = act(initial(), "window.split-side-by-side");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT)],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(MAIN)), ["second"])],
      }),
    );
  });

  it("splits stacked with the same rule, the new pane below", () => {
    const { state, applied } = act(initial(), "window.split-stacked");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT)],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(splitNode("stacked", 0.5, leaf(MAIN), leaf(MAIN)), ["second"])],
      }),
    );
  });

  it("nests a second split inside the focused pane and keeps the focus path a path", () => {
    const twice = apply(apply(initial(), "window.split-side-by-side"), "window.split-stacked");
    expect(snapshot(twice)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT)],
        activeBufferId: bufferId(MAIN),
        tabs: [
          tabOf(
            splitNode(
              "side-by-side",
              0.5,
              leaf(MAIN),
              splitNode("stacked", 0.5, leaf(MAIN), leaf(MAIN)),
            ),
            ["second", "second"],
          ),
        ],
      }),
    );
  });

  it("registers the buffer once even though both panes show it", () => {
    const state = apply(initial(), "window.split-side-by-side");
    expect(state.buffers).toHaveLength(1);
    expect(snapshot(state).buffers).toHaveLength(1);
  });
});

describe("editing follows the focused window", () => {
  it("keeps dispatchWorkspace editing the focused buffer once the tree has two leaves", () => {
    const opened = command(apply(initial(), "window.split-side-by-side"), "e src/lib/format.ts");
    expect(snapshot(opened)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(FORMAT),
        tabs: [tabOf(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)), ["second"])],
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );

    const edited = runWorkspaceKeys(opened, keysOf("x"));
    expect(snapshot(edited)).toEqual(
      stateOf({
        buffers: [
          bufferState(MAIN, MAIN_TEXT),
          bufferState(
            FORMAT,
            "xport const format = (value: number) => String(value);",
            { line: 0, column: 0 },
            true,
          ),
        ],
        activeBufferId: bufferId(FORMAT),
        tabs: [tabOf(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)), ["second"])],
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
  });

  it("edits the buffer of the pane focus moved to", () => {
    const left = apply(sideBySide(), "window.focus-left");
    expect(dispatchWorkspace(left, key("x")).accepted).toBe(true);
    const edited = runWorkspaceKeys(left, keysOf("x"));
    expect(snapshot(edited)).toEqual(
      stateOf({
        buffers: [
          bufferState(MAIN, 'onst mode = "development";', { line: 0, column: 0 }, true),
          bufferState(FORMAT, FORMAT_TEXT),
        ],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)), ["first"])],
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
  });
});

describe("window.focus-* — moving between windows by layout direction", () => {
  it("focus-left moves to the left window and makes its buffer active", () => {
    const { state, applied } = act(sideBySide(), "window.focus-left");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)), ["first"])],
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
  });

  it("focus-right returns to the right window", () => {
    const { state, applied } = act(apply(sideBySide(), "window.focus-left"), "window.focus-right");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(FORMAT),
        tabs: [tabOf(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)), ["second"])],
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
  });

  it("focus-up and focus-down move inside a stacked split", () => {
    const stacked = apply(initial(), "window.split-stacked");
    const up = act(stacked, "window.focus-up");
    expect(up.applied).toBe(true);
    expect(up.state.tabs[0]?.focus).toEqual(["first"]);

    const down = act(up.state, "window.focus-down");
    expect(down.applied).toBe(true);
    expect(down.state.tabs[0]?.focus).toEqual(["second"]);

    const downAgain = act(down.state, "window.focus-down");
    expect(downAgain.applied).toBe(false);
    expect(downAgain.reason).toBe("window.focus-down: no stacked split on the focus path");
  });

  it("refuses a left/right key in a stacked split and leaves the state identical", () => {
    const stacked = apply(initial(), "window.split-stacked");
    const { state, applied, reason } = act(stacked, "window.focus-left");
    expect(applied).toBe(false);
    expect(reason).toBe("window.focus-left: no side-by-side split on the focus path");
    expect(state).toBe(stacked);
  });

  it("refuses focus-right when the focused window is already the rightmost", () => {
    const right = sideBySide();
    const { state, applied, reason } = act(right, "window.focus-right");
    expect(applied).toBe(false);
    expect(reason).toBe("window.focus-right: no side-by-side split on the focus path");
    expect(state).toBe(right);
  });

  it("walks out of a nested pane before giving up", () => {
    const nested = apply(apply(initial(), "window.split-side-by-side"), "window.split-stacked");
    const { state, applied } = act(nested, "window.focus-left");
    expect(applied).toBe(true);
    expect(snapshot(state).tabs[0]?.focus).toEqual(["first"]);
  });
});

describe("window.close — closing the focused window", () => {
  it("closes the focused pane and hands focus to the sibling pane", () => {
    const { state, applied } = act(sideBySide(), "window.close");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(leaf(MAIN), [])],
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
  });

  it("keeps the closed buffer open, so :bn can bring it back", () => {
    const closed = apply(sideBySide(), "window.close");
    expect(closed.buffers.map((buffer) => buffer.path)).toEqual([MAIN, FORMAT]);
    const back = command(closed, "bn");
    expect(back.activeBufferId).toBe(bufferId(FORMAT));
    expect(snapshot(back).tabs[0]).toEqual(tabOf(leaf(FORMAT), []));
  });

  it("focuses the sibling's last leaf when the sibling is itself a split", () => {
    const nested = apply(apply(initial(), "window.split-side-by-side"), "window.split-stacked");
    const left = apply(nested, "window.focus-left");
    const { state, applied } = act(left, "window.close");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT)],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(splitNode("stacked", 0.5, leaf(MAIN), leaf(MAIN)), ["second"])],
      }),
    );
  });

  it("refuses to close the last window", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "window.close");
    expect(applied).toBe(false);
    expect(reason).toBe("window.close: the last window cannot be closed");
    expect(state).toBe(before);
  });
});

describe("window.resize-* — a ratio step, never pixels", () => {
  it("widens and narrows the side-by-side split by 0.05", () => {
    const wider = apply(sideBySide(), "window.resize-wider");
    expect(snapshot(wider)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(FORMAT),
        tabs: [tabOf(splitNode("side-by-side", 0.55, leaf(MAIN), leaf(FORMAT)), ["second"])],
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
    const narrower = apply(wider, "window.resize-narrower");
    expect(snapshot(narrower).tabs[0]?.root).toEqual(
      splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)),
    );
  });

  it("makes the stacked split taller and shorter", () => {
    const taller = apply(apply(initial(), "window.split-stacked"), "window.resize-taller");
    expect(snapshot(taller).tabs[0]?.root).toEqual(
      splitNode("stacked", 0.55, leaf(MAIN), leaf(MAIN)),
    );
    const shorter = apply(taller, "window.resize-shorter");
    expect(snapshot(shorter).tabs[0]?.root).toEqual(
      splitNode("stacked", 0.5, leaf(MAIN), leaf(MAIN)),
    );
  });

  it("steps the nearest split of the matching layout on the focus path", () => {
    const nested = apply(apply(initial(), "window.split-side-by-side"), "window.split-stacked");
    const wider = apply(nested, "window.resize-wider");
    expect(snapshot(wider).tabs[0]?.root).toEqual(
      splitNode(
        "side-by-side",
        0.55,
        leaf(MAIN),
        splitNode("stacked", 0.5, leaf(MAIN), leaf(MAIN)),
      ),
    );
    const taller = apply(wider, "window.resize-taller");
    expect(snapshot(taller).tabs[0]?.root).toEqual(
      splitNode(
        "side-by-side",
        0.55,
        leaf(MAIN),
        splitNode("stacked", 0.55, leaf(MAIN), leaf(MAIN)),
      ),
    );
  });

  it("refuses to resize beyond 0.9 and leaves the state identical", () => {
    let state = sideBySide();
    for (let step = 0; step < 8; step += 1) state = apply(state, "window.resize-wider");
    expect(snapshot(state).tabs[0]?.root).toEqual(
      splitNode("side-by-side", 0.9, leaf(MAIN), leaf(FORMAT)),
    );
    const { state: unchanged, applied, reason } = act(state, "window.resize-wider");
    expect(applied).toBe(false);
    expect(reason).toBe("window.resize-wider: the split is already at the 0.9 bound");
    expect(unchanged).toBe(state);
  });

  it("refuses to resize below 0.1", () => {
    let state = sideBySide();
    for (let step = 0; step < 8; step += 1) state = apply(state, "window.resize-narrower");
    expect(snapshot(state).tabs[0]?.root).toEqual(
      splitNode("side-by-side", 0.1, leaf(MAIN), leaf(FORMAT)),
    );
    const { applied, reason } = act(state, "window.resize-narrower");
    expect(applied).toBe(false);
    expect(reason).toBe("window.resize-narrower: the split is already at the 0.1 bound");
  });

  it("refuses when no split of that layout is on the focus path", () => {
    const stacked = apply(initial(), "window.split-stacked");
    const { state, applied, reason } = act(stacked, "window.resize-wider");
    expect(applied).toBe(false);
    expect(reason).toBe("window.resize-wider: no side-by-side split on the focus path");
    expect(state).toBe(stacked);
  });
});

describe("window.zoom — a stored target, not a changed tree", () => {
  it("stores the tab and the focus path and leaves the tree alone", () => {
    const before = sideBySide();
    const { state, applied } = act(before, "window.zoom");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(FORMAT),
        tabs: [tabOf(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)), ["second"])],
        zoom: { tabId: "tab:1", leafPath: ["second"] },
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
    expect(state.tabs[0]?.root).toBe(before.tabs[0]?.root);
  });

  it("clears the zoom when pressed again, so restoring costs one action", () => {
    const before = sideBySide();
    const zoomed = apply(before, "window.zoom");
    const { state, applied } = act(zoomed, "window.zoom");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(snapshot(before));
    expect(state.zoom).toBeNull();
    expect(state.tabs[0]?.root).toBe(before.tabs[0]?.root);
  });

  it("drops a zoom whose window was closed", () => {
    const zoomed = apply(sideBySide(), "window.zoom");
    const closed = apply(zoomed, "window.close");
    expect(closed.zoom).toBeNull();
  });
});

describe("window.swap — buffers, not layout", () => {
  it("exchanges the two windows' buffers and keeps shape, ratio and focus", () => {
    const { state, applied } = act(sideBySide(), "window.swap");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(splitNode("side-by-side", 0.5, leaf(FORMAT), leaf(MAIN)), ["second"])],
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
  });

  it("swaps with the nearest sibling leaf in a nested tree", () => {
    // Left pane stacked in two, right pane on the format file; the focused lower-left pane edited.
    const outer = sideBySide();
    const left = apply(outer, "window.focus-left");
    const stacked = apply(left, "window.split-stacked");
    const withReadme = apply(command(stacked, "e README.md"), "window.swap");
    expect(snapshot(withReadme).tabs[0]?.root).toEqual(
      splitNode(
        "side-by-side",
        0.5,
        splitNode("stacked", 0.5, leaf(README), leaf(MAIN)),
        leaf(FORMAT),
      ),
    );
    // The focus, the shape and the ratio stay where they were: only the two buffers moved.
    expect(snapshot(withReadme).tabs[0]?.focus).toEqual(["first", "second"]);
    expect(withReadme.activeBufferId).toBe(bufferId(MAIN));
  });

  it("refuses to swap with a single window", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "window.swap");
    expect(applied).toBe(false);
    expect(reason).toBe("window.swap: the tab has a single window");
    expect(state).toBe(before);
  });
});

describe("window.new — a pane on a named file", () => {
  it("opens the path in a new pane beside the focused one", () => {
    const { state, applied } = act(initial(), "window.new", { path: FORMAT });
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(FORMAT),
        tabs: [tabOf(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)), ["second"])],
      }),
    );
  });

  it("reuses a buffer that is already open instead of registering it twice", () => {
    const opened = openedFormat();
    const { state, applied } = act(opened, "window.new", { path: FORMAT });
    expect(applied).toBe(true);
    expect(state.buffers).toHaveLength(2);
    expect(snapshot(state).tabs[0]?.root).toEqual(
      splitNode("side-by-side", 0.5, leaf(FORMAT), leaf(FORMAT)),
    );
  });

  it("refuses without a path: the simulation launches no applications", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "window.new");
    expect(applied).toBe(false);
    expect(reason).toBe(
      "window.new: no path to open: the simulated workspace opens files, not applications",
    );
    expect(state).toBe(before);
  });

  it("refuses a path that is not on the simulated disk", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "window.new", { path: "missing.ts" });
    expect(applied).toBe(false);
    expect(reason).toBe("E484: Can't open file missing.ts");
    expect(state).toBe(before);
  });
});

describe("tab.new, tab.next, tab.previous — tabs in the state", () => {
  it("opens a second tab on the active buffer and switches to it", () => {
    const { state, applied } = act(sideBySide(), "tab.new");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(FORMAT),
        tabs: [
          tabOf(splitNode("side-by-side", 0.5, leaf(MAIN), leaf(FORMAT)), ["second"]),
          { id: "tab:2", root: leaf(FORMAT), focus: [] },
        ],
        activeTabId: "tab:2",
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
  });

  it("cycles forward and backward across two tabs, wrapping around", () => {
    const twoTabs = apply(sideBySide(), "tab.new");
    const next = act(twoTabs, "tab.next");
    expect(next.applied).toBe(true);
    expect(next.state.activeTabId).toBe("tab:1");
    expect(next.state.activeBufferId).toBe(bufferId(FORMAT));

    const previous = act(twoTabs, "tab.previous");
    expect(previous.applied).toBe(true);
    expect(previous.state.activeTabId).toBe("tab:1");

    const forward = act(next.state, "tab.next");
    expect(forward.state.activeTabId).toBe("tab:2");
    expect(forward.state.activeBufferId).toBe(bufferId(FORMAT));
  });

  it("wraps to itself with a single tab and accepts the action", () => {
    const before = initial();
    const { state, applied } = act(before, "tab.next");
    expect(applied).toBe(true);
    expect(state).toBe(before);
  });
});

describe("workspace.switch — selecting a tab", () => {
  it("selects the tab named in the options and follows its focus path", () => {
    const twoTabs = apply(sideBySide(), "tab.new");
    expect(twoTabs.activeTabId).toBe("tab:2");
    const { state, applied } = act(twoTabs, "workspace.switch", { tabId: "tab:1" });
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual({
      ...snapshot(twoTabs),
      activeTabId: "tab:1",
      activeBufferId: bufferId(FORMAT),
    });
  });

  it("cycles to the next tab when no target is given", () => {
    const twoTabs = apply(sideBySide(), "tab.new");
    const { state, applied } = act(twoTabs, "workspace.switch");
    expect(applied).toBe(true);
    expect(state.activeTabId).toBe("tab:1");
  });

  it("refuses a tab that is not open", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "workspace.switch", { tabId: "tab:9" });
    expect(applied).toBe(false);
    expect(reason).toBe("workspace.switch: no tab named tab:9");
    expect(state).toBe(before);
  });
});

/*
 * T4b: files and buffers are actions too (S1, S5). A learner who opens `src/lib/format.ts` with
 * `:e`, with Goto-file in LazyVim or with a tmux picker is doing one thing, so the engine applies
 * the `file.*` and `buffer.*` actions the vocabulary already has — and the T1 command line keeps
 * working beside them, through the same state function. The tests below are the oracle for both.
 */

describe("file.open — a file, or the buffer already showing it", () => {
  it("opens a file that is on the simulated disk and focuses it", () => {
    const { state, applied } = act(initial(), "file.open", { path: FORMAT });
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(FORMAT),
        tabs: [tabOf(leaf(FORMAT))],
      }),
    );
  });

  it("focuses a buffer that is already open instead of registering it twice", () => {
    const before = openedFormat();
    const { state, applied } = act(before, "file.open", { path: MAIN });
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(leaf(MAIN))],
        lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
      }),
    );
  });

  it("refuses a path that is not on the simulated disk and leaves the state identical", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "file.open", { path: "missing.ts" });
    expect(applied).toBe(false);
    expect(reason).toBe("E484: Can't open file missing.ts");
    expect(state).toBe(before);
  });

  it("refuses without a path: the simulation opens no file dialog", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "file.open");
    expect(applied).toBe(false);
    expect(reason).toBe("file.open: no path given");
    expect(state).toBe(before);
  });
});

describe("file.new — an empty buffer the disk does not have yet", () => {
  it("opens an empty buffer for a path that is not on disk, writing nothing yet", () => {
    const { state, applied } = act(initial(), "file.new", { path: "notes.md" });
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState("notes.md", "")],
        activeBufferId: bufferId("notes.md"),
        tabs: [tabOf(leaf("notes.md"))],
      }),
    );
  });

  it("refuses a path that already exists and leaves the state identical", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "file.new", { path: MAIN });
    expect(applied).toBe(false);
    expect(reason).toBe("file.new: src/main.ts already exists");
    expect(state).toBe(before);
  });

  it("refuses without a path", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "file.new");
    expect(applied).toBe(false);
    expect(reason).toBe("file.new: no path given");
    expect(state).toBe(before);
  });

  it("refuses a path whose buffer is already open: a buffer is registered once", () => {
    const created = apply(initial(), "file.new", { path: "notes.md" });
    const { state, applied, reason } = act(created, "file.new", { path: "notes.md" });
    expect(applied).toBe(false);
    expect(reason).toBe("file.new: notes.md is already open");
    expect(state).toBe(created);
  });
});

describe("file.save — the buffer written into the simulated disk", () => {
  it("writes the edited text and clears modified", () => {
    const edited = runWorkspaceKeys(initial(), keysOf("x"));
    const saved = 'onst mode = "development";';
    const { state, applied } = act(edited, "file.save");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        files: { ...FILES, [MAIN]: saved },
        buffers: [bufferState(MAIN, saved)],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(leaf(MAIN))],
      }),
    );
  });

  it("refuses a buffer with no changes and leaves the state identical", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "file.save");
    expect(applied).toBe(false);
    expect(reason).toBe("file.save: the active buffer has no changes");
    expect(state).toBe(before);
  });
});

describe("file.close-buffer — one buffer closed, the file still on disk", () => {
  const threeOpen = (): WorkspaceState =>
    command(command(initial(), "e src/lib/format.ts"), "e README.md");

  it("closes the active buffer and hands its window the next buffer in open order", () => {
    const { state, applied } = act(threeOpen(), "file.close-buffer");
    expect(applied).toBe(true);
    expect(state.buffers.map((buffer) => buffer.path)).toEqual([MAIN, FORMAT]);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [bufferState(MAIN, MAIN_TEXT), bufferState(FORMAT, FORMAT_TEXT)],
        activeBufferId: bufferId(FORMAT),
        tabs: [tabOf(leaf(FORMAT))],
        lastCommand: { command: "e README.md", accepted: true, output: [] },
      }),
    );
  });

  it("falls back to the previous buffer when the closed one was the last", () => {
    const active = command(threeOpen(), "bp");
    expect(active.activeBufferId).toBe(bufferId(FORMAT));
    const { state, applied } = act(active, "file.close-buffer");
    expect(applied).toBe(true);
    expect(state.buffers.map((buffer) => buffer.path)).toEqual([MAIN, README]);
    expect(state.activeBufferId).toBe(bufferId(README));
    expect(snapshot(state).tabs[0]).toEqual(tabOf(leaf(README)));
  });

  it("replaces every window that showed the closed buffer", () => {
    // Both panes show the format file; closing it leaves two windows on the file that stays open.
    const bothPanes = apply(openedFormat(), "window.split-side-by-side");
    const { state, applied } = act(bothPanes, "file.close-buffer");
    expect(applied).toBe(true);
    expect(state.buffers.map((buffer) => buffer.path)).toEqual([MAIN]);
    expect(snapshot(state).tabs[0]?.root).toEqual(
      splitNode("side-by-side", 0.5, leaf(MAIN), leaf(MAIN)),
    );
    expect(state.activeBufferId).toBe(bufferId(MAIN));
  });

  it("refuses to close the last buffer and leaves the state identical", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "file.close-buffer");
    expect(applied).toBe(false);
    expect(reason).toBe("file.close-buffer: the last buffer cannot be closed");
    expect(state).toBe(before);
  });
});

describe("buffer.next, buffer.previous — cycling in open order", () => {
  const threeOpen = (): WorkspaceState =>
    command(command(initial(), "e src/lib/format.ts"), "e README.md");

  it("goes to the next buffer and wraps around from the last to the first", () => {
    const { state, applied } = act(threeOpen(), "buffer.next");
    expect(applied).toBe(true);
    expect(snapshot(state)).toEqual(
      stateOf({
        buffers: [
          bufferState(MAIN, MAIN_TEXT),
          bufferState(FORMAT, FORMAT_TEXT),
          bufferState(README, README_TEXT),
        ],
        activeBufferId: bufferId(MAIN),
        tabs: [tabOf(leaf(MAIN))],
        lastCommand: { command: "e README.md", accepted: true, output: [] },
      }),
    );
  });

  it("goes to the previous buffer", () => {
    const { state, applied } = act(threeOpen(), "buffer.previous");
    expect(applied).toBe(true);
    expect(state.activeBufferId).toBe(bufferId(FORMAT));
    expect(snapshot(state).tabs[0]).toEqual(tabOf(leaf(FORMAT)));
  });

  it("refuses both with a single buffer open, naming the action", () => {
    const before = initial();
    for (const action of ["buffer.next", "buffer.previous"] as const) {
      const { state, applied, reason } = act(before, action);
      expect(applied).toBe(false);
      expect(reason).toBe(`${action}: only one buffer is open`);
      expect(state).toBe(before);
    }
  });

  it("keeps :bn and :bp accepted on a single buffer, wrapping onto the same buffer", () => {
    const before = initial();
    for (const line of ["bn", "bp"] as const) {
      const typed = command(before, line);
      expect(typed.lastCommand).toEqual({ command: line, accepted: true, output: [] });
      expect(paritySnapshot(typed)).toEqual(paritySnapshot(before));
    }
  });
});

describe("picker-shaped actions are deterministic queries now (T5c)", () => {
  it.each([
    ["file.find", "file.find: no query given"],
    ["grep.project", "grep.project: no query given"],
    ["buffer.list", "buffer.list: no path given"],
  ])("refuses %s when it names nothing to look for", (action, reason) => {
    const before = initial();
    const { state, applied, reason: found } = act(before, action);
    expect(applied).toBe(false);
    expect(found).toBe(reason);
    expect(state).toBe(before);
  });
});

/**
 * The command line and the actions must not disagree (T4b). Every pair below starts from the same
 * state and asserts the same end state; the only field an action may leave alone is
 * `lastCommand`, which records the line a learner typed and that no action typed, so it is blanked
 * before the comparison and asserted on its own in each test.
 */
const paritySnapshot = (state: WorkspaceState): Snapshot => ({ ...snapshot(state), lastCommand: null });

describe("parity — same state function, one command line and one action", () => {
  it(":e <path> and file.open reach the same state", () => {
    const before = initial();
    const typed = command(before, `e ${FORMAT}`);
    const acted = act(before, "file.open", { path: FORMAT });
    expect(acted.applied).toBe(true);
    expect(paritySnapshot(acted.state)).toEqual(paritySnapshot(typed));
    // The action never writes the command-line record; the command line always does.
    expect(acted.state.lastCommand).toBe(before.lastCommand);
    expect(typed.lastCommand).toEqual({
      command: `e ${FORMAT}`,
      accepted: true,
      output: [],
    });
  });

  it(":w and file.save reach the same state", () => {
    const edited = runWorkspaceKeys(initial(), keysOf("x"));
    const typed = command(edited, "w");
    const acted = act(edited, "file.save");
    expect(acted.applied).toBe(true);
    expect(paritySnapshot(acted.state)).toEqual(paritySnapshot(typed));
    expect(typed.files[MAIN]).toBe('onst mode = "development";');
  });

  it(":bn and buffer.next reach the same state", () => {
    const before = command(command(initial(), `e ${FORMAT}`), `e ${README}`);
    const typed = command(before, "bn");
    const acted = act(before, "buffer.next");
    expect(acted.applied).toBe(true);
    expect(paritySnapshot(acted.state)).toEqual(paritySnapshot(typed));
    expect(acted.state.activeBufferId).toBe(bufferId(MAIN));
  });

  it(":bp and buffer.previous reach the same state", () => {
    const before = command(command(initial(), `e ${FORMAT}`), "bn");
    expect(before.activeBufferId).toBe(bufferId(MAIN));
    const typed = command(before, "bp");
    const acted = act(before, "buffer.previous");
    expect(acted.applied).toBe(true);
    expect(paritySnapshot(acted.state)).toEqual(paritySnapshot(typed));
    expect(acted.state.activeBufferId).toBe(bufferId(FORMAT));
  });
});

describe("file and buffer invariants", () => {
  const FILE_SCRIPT: readonly Step[] = [
    { kind: "action", action: "window.split-side-by-side" },
    { kind: "action", action: "file.open", options: { path: FORMAT } },
    { kind: "action", action: "buffer.next" },
    { kind: "action", action: "file.open", options: { path: README } },
    { kind: "action", action: "file.close-buffer" },
    { kind: "action", action: "file.new", options: { path: "notes.md" } },
    { kind: "action", action: "file.save" },
    { kind: "action", action: "buffer.previous" },
    { kind: "action", action: "file.close-buffer" },
    { kind: "action", action: "file.close-buffer" },
    { kind: "action", action: "file.close-buffer" },
  ];

  it("holds the invariants after every file and buffer step", () => {
    let state = initial();
    for (const step of FILE_SCRIPT) {
      state = runStep(state, step);
      expectInvariants(state);
    }
    // The last close closed the second of two buffers; the third had nothing left to close.
    expect(state.buffers).toHaveLength(1);
    expect(state.activeBufferId).toBe(bufferId(MAIN));
  });

  it("gives the same whole state for the same file and buffer script twice", () => {
    const first = FILE_SCRIPT.reduce(runStep, initial());
    const second = FILE_SCRIPT.reduce(runStep, initial());
    expect(snapshot(first)).toEqual(snapshot(second));
  });
});

describe("totality", () => {
  it("lists exactly the window, tab and workspace actions of the keymap vocabulary", () => {
    expect([...WORKSPACE_ACTIONS]).toEqual([
      "window.split-side-by-side",
      "window.split-stacked",
      "window.close",
      "window.focus-left",
      "window.focus-right",
      "window.focus-up",
      "window.focus-down",
      "window.resize-wider",
      "window.resize-narrower",
      "window.resize-taller",
      "window.resize-shorter",
      "window.zoom",
      "window.swap",
      "window.new",
      "tab.new",
      "tab.next",
      "tab.previous",
      "workspace.switch",
    ]);
  });

  it("lists exactly the file and buffer actions of the keymap vocabulary it applies", () => {
    expect([...WORKSPACE_FILE_ACTIONS]).toEqual([
      "file.open",
      "file.new",
      "file.save",
      "file.close-buffer",
      "buffer.next",
      "buffer.previous",
    ]);
  });

  it("lists the picker-shaped actions it applies as deterministic queries", () => {
    expect([...WORKSPACE_PICKER_ACTIONS]).toEqual(["file.find", "grep.project", "buffer.list"]);
  });

  it("refuses an action outside the vocabulary without throwing", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "window.dance");
    expect(applied).toBe(false);
    expect(reason).toBe("Unknown workspace action: window.dance");
    expect(state).toBe(before);
  });
});

/** Ratios, children and leaf buffers of one tree: an empty or out-of-bounds split is the bug. */
function expectSoundTree(node: WindowNode): void {
  // A window, whichever it shows: a terminal leaf is a window like a file leaf (T7a1).
  if (node.kind !== "split") return;
  expect(node.first).toBeDefined();
  expect(node.second).toBeDefined();
  expect(["side-by-side", "stacked"]).toContain(node.layout);
  expect(node.ratio).toBeGreaterThanOrEqual(0.1);
  expect(node.ratio).toBeLessThanOrEqual(0.9);
  expectSoundTree(node.first);
  expectSoundTree(node.second);
}

/**
 * The design's invariants, asserted after every step of a scenario script.
 *
 * `activeBufferId` follows the focused window's buffer, and a focused terminal window has none, so
 * the equality holds whenever focus is on a file and the buffer keeps its last value otherwise: a
 * session is not a file and must not unload the file the learner was editing (T7a1).
 */
function expectInvariants(state: WorkspaceState): void {
  const tab = activeTab(state);
  expect(tab).toBeDefined();
  if (tab === undefined) return;
  const focused = focusedNode(tab);
  expect(focused).toBeDefined();
  // A focused terminal window has no buffer, so only a file window pins the active buffer.
  if (focused?.kind === "leaf") expect(state.activeBufferId).toBe(focused.bufferId);

  for (const each of state.tabs) {
    expectSoundTree(each.root);
    for (const bufferIdValue of leafBufferIds(each.root)) {
      expect(state.buffers.some((buffer) => buffer.id === bufferIdValue)).toBe(true);
    }
  }
  const registered = state.buffers.map((buffer) => buffer.id);
  expect(new Set(registered).size).toBe(registered.length);
}

type Step =
  | { readonly kind: "action"; readonly action: string; readonly options?: WorkspaceActionOptions }
  | { readonly kind: "keys"; readonly text: string };

const runStep = (state: WorkspaceState, step: Step): WorkspaceState =>
  step.kind === "action"
    ? apply(state, step.action, step.options)
    : runWorkspaceKeys(state, [...keysOf(step.text), key("Enter")]);

const SCRIPT: readonly Step[] = [
  { kind: "action", action: "window.split-side-by-side" },
  { kind: "keys", text: ":e src/lib/format.ts" },
  { kind: "action", action: "window.split-stacked" },
  { kind: "action", action: "window.focus-up" },
  { kind: "action", action: "window.focus-down" },
  { kind: "action", action: "window.resize-taller" },
  { kind: "action", action: "window.resize-shorter" },
  { kind: "action", action: "window.resize-wider" },
  { kind: "action", action: "window.swap" },
  { kind: "action", action: "window.zoom" },
  { kind: "action", action: "window.zoom" },
  { kind: "action", action: "window.new", options: { path: "src/main.ts" } },
  { kind: "action", action: "window.focus-left" },
  { kind: "action", action: "window.close" },
  { kind: "action", action: "tab.new" },
  { kind: "action", action: "tab.next" },
  { kind: "action", action: "tab.previous" },
  { kind: "action", action: "workspace.switch", options: { tabId: "tab:1" } },
  { kind: "action", action: "window.close" },
  { kind: "action", action: "window.close" },
  { kind: "action", action: "window.close" },
];

describe("invariants, determinism", () => {
  it("holds the invariants after every step of a scenario script", () => {
    let state = initial();
    expectInvariants(state);
    for (const step of SCRIPT) {
      state = runStep(state, step);
      expectInvariants(state);
    }
    // The script ends on a single window: the last close was refused, not silently dropped.
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[0]?.focus).toEqual([]);
  });

  it("gives the same whole state for the same script twice", () => {
    const first = SCRIPT.reduce(runStep, initial());
    const second = SCRIPT.reduce(runStep, initial());
    expect(first).toEqual(second);
    expect(snapshot(first)).toEqual(snapshot(second));
  });
});
