import { describe, expect, it } from "vitest";

import {
  applyWorkspaceAction,
  createWorkspace,
  focusLeafIndex,
  layoutText,
  runWorkspaceKeys,
  splitRatios,
  workspaceObjectiveView,
  type WorkspaceState,
} from "./index";

/**
 * The printers an objective compares against (T3): the layout as a person would draw it, the
 * pre-order index of the focused leaf, and the pre-order split ratios. They exist so there is one
 * implementation of "what shape is this", shared by evaluation and the UI.
 */

const MAIN_TEXT = 'const mode = "development";';
const FORMAT_TEXT = "export const format = (value: number) => String(value);";

const FILES: Readonly<Record<string, string>> = {
  "src/main.ts": MAIN_TEXT,
  "src/lib/format.ts": FORMAT_TEXT,
};
const MAIN = "src/main.ts";
const CWD = "/project";
const INIT = { files: FILES, path: MAIN, cwd: CWD };

/**
 * The same workspace with the terminal an exercise declares (T7a1). A terminal is a window that
 * shows a session, not a file, so `windows` prints its leaf as `terminal:<title>` while the layout
 * keeps calling every leaf a `leaf`.
 */
const TERMINAL_INIT = {
  files: FILES,
  path: MAIN,
  cwd: CWD,
  terminal: { title: "dev", cwd: CWD, commands: { "npm test": ["Tests: 3 passed"] } },
};

/** Applies an action that must apply; a refused one is a bug in the test, not a tolerated result. */
function apply(state: WorkspaceState, action: string): WorkspaceState {
  const result = applyWorkspaceAction(state, action);
  if (!result.applied) throw new Error(`${action} was refused: ${result.reason ?? "no reason"}`);
  return result.state;
}

/**
 * `side(leaf, stacked(leaf, leaf))`: split the only window, then split the new one.
 * Leaves in pre-order: [first, second.first, second.second]; focus is the third.
 */
function sideThenStacked(): WorkspaceState {
  return apply(apply(createWorkspace(INIT), "window.split-side-by-side"), "window.split-stacked");
}

/**
 * `stacked(side(leaf, leaf), leaf)`: split, focus the first pane, split it side by side.
 * Leaves in pre-order: [first.first, first.second, second]; focus is `first.second`.
 */
function stackedThenSide(): WorkspaceState {
  const split = apply(createWorkspace(INIT), "window.split-stacked");
  return apply(apply(split, "window.focus-up"), "window.split-side-by-side");
}

describe("layoutText prints the window tree as a person draws it", () => {
  it("prints one window as a leaf", () => {
    expect(layoutText(createWorkspace(INIT).tabs[0]!.root)).toBe("leaf");
  });

  it("names a side-by-side split by the layout it produces", () => {
    const state = apply(createWorkspace(INIT), "window.split-side-by-side");
    expect(layoutText(state.tabs[0]!.root)).toBe("side(leaf, leaf)");
  });

  it("names a stacked split and keeps nesting in pre-order", () => {
    expect(layoutText(sideThenStacked().tabs[0]!.root)).toBe("side(leaf, stacked(leaf, leaf))");
    expect(layoutText(stackedThenSide().tabs[0]!.root)).toBe("stacked(side(leaf, leaf), leaf)");
  });

  it("prints the same text for the same tree, without changing it", () => {
    const root = sideThenStacked().tabs[0]!.root;
    const before = JSON.stringify(root);
    expect(layoutText(root)).toBe(layoutText(root));
    expect(JSON.stringify(root)).toBe(before);
  });
});

describe("splitRatios lists the ratios in pre-order", () => {
  it("is empty for a tab of one window", () => {
    expect(splitRatios(createWorkspace(INIT).tabs[0]!.root)).toEqual([]);
  });

  it("lists the root split before the nested one", () => {
    const state = apply(
      apply(apply(createWorkspace(INIT), "window.split-side-by-side"), "window.resize-wider"),
      "window.split-stacked",
    );
    // The first split was widened to 0.55; the nested split keeps its default.
    expect(splitRatios(state.tabs[0]!.root)).toEqual([0.55, 0.5]);
  });

  it("addresses both orientations by the same pre-order rule", () => {
    expect(splitRatios(stackedThenSide().tabs[0]!.root)).toEqual([0.5, 0.5]);
  });
});

describe("focusLeafIndex is the pre-order index of the focused leaf", () => {
  it("is 0 for a tab of one window", () => {
    expect(focusLeafIndex(createWorkspace(INIT))).toBe(0);
  });

  it("counts the leaves before the focused one", () => {
    expect(focusLeafIndex(apply(createWorkspace(INIT), "window.split-side-by-side"))).toBe(1);
    expect(focusLeafIndex(sideThenStacked())).toBe(2);
    // Focus moved into the first pane of the side-by-side split: index 1, not 2.
    expect(focusLeafIndex(stackedThenSide())).toBe(1);
  });

  it("follows focus when it moves", () => {
    const state = apply(sideThenStacked(), "window.focus-up");
    expect(focusLeafIndex(state)).toBe(1);
  });

  it("is undefined when the state has no active tab, instead of throwing", () => {
    const state = createWorkspace(INIT);
    expect(focusLeafIndex({ ...state, tabs: [] })).toBeUndefined();
  });
});

describe("workspaceObjectiveView projects the state an objective is judged against", () => {
  it("reads files, buffers and the active path", () => {
    const state = createWorkspace(INIT);
    expect(workspaceObjectiveView(state)).toEqual({
      files: FILES,
      buffers: [{ path: MAIN, text: MAIN_TEXT }],
      activePath: MAIN,
      layout: "leaf",
      focus: 0,
      splitRatios: [],
      matches: [],
      zoomedPath: null,
      windowPaths: [MAIN],
      terminalOutput: null,
      detached: false,
      mode: "normal",
    });
  });

  it("carries the mode and whether the session is detached, so a story can assert both", () => {
    const state = apply(createWorkspace(INIT), "window.split-side-by-side");
    expect(workspaceObjectiveView(state)).toMatchObject({ detached: false, mode: "normal" });

    const resizing = apply(state, "window.enter-resize-mode");
    expect(workspaceObjectiveView(resizing).mode).toBe("resize");

    // The freeze is a flag beside the workspace, not a shape of it: the layout still prints.
    const detached = applyWorkspaceAction(resizing, "session.detach");
    if (!detached.applied) throw new Error("session.detach was refused");
    expect(workspaceObjectiveView(detached.state)).toMatchObject({
      detached: true,
      mode: "resize",
      layout: "side(leaf, leaf)",
    });
  });

  it("carries the rows the last project search recorded, in project order", () => {
    const state = createWorkspace({
      files: { "src/b.ts": "one port", "src/a.ts": "port two" },
      path: "src/a.ts",
      cwd: "/project",
    });
    const result = applyWorkspaceAction(state, "grep.project", { query: "port" });
    if (!result.applied) throw new Error("grep.project was refused");
    expect(workspaceObjectiveView(result.state).matches).toEqual([
      { path: "src/a.ts", line: 1, text: "port two" },
      { path: "src/b.ts", line: 1, text: "one port" },
    ]);
  });

  it("prints the layout, focus and ratios of the active tab", () => {
    const state = sideThenStacked();
    const view = workspaceObjectiveView(state);
    expect(view.buffers).toEqual([{ path: MAIN, text: MAIN_TEXT }]);
    expect(view.layout).toBe("side(leaf, stacked(leaf, leaf))");
    expect(view.focus).toBe(2);
    expect(view.splitRatios).toEqual([0.5, 0.5]);
    expect(view.zoomedPath).toBeNull();
  });

  it("prints the path of the zoomed window, and none once it is restored", () => {    const opened = apply(createWorkspace(INIT), "window.split-side-by-side");
    expect(workspaceObjectiveView(opened).zoomedPath).toBeNull();
    const zoomed = apply(opened, "window.zoom");
    expect(workspaceObjectiveView(zoomed).zoomedPath).toBe(MAIN);
    expect(workspaceObjectiveView(zoomed).layout).toBe("side(leaf, leaf)");
    expect(workspaceObjectiveView(apply(zoomed, "window.zoom")).zoomedPath).toBeNull();
  });

  it("reads the text of every open buffer, not only the active one", () => {
    const keys = [...":e src/lib/format.ts"].map((key) => ({ key }));
    const opened = runWorkspaceKeys(createWorkspace(INIT), [...keys, { key: "Enter" }]);
    const view = workspaceObjectiveView(opened);
    expect(view.buffers).toEqual([
      { path: MAIN, text: MAIN_TEXT },
      { path: "src/lib/format.ts", text: FORMAT_TEXT },
    ]);
    expect(view.activePath).toBe("src/lib/format.ts");
  });
});

describe("a terminal window prints as a terminal, not as a file", () => {
  const launched = () => apply(createWorkspace(TERMINAL_INIT), "app.launch-terminal");

  it("prints the leaf as terminal:<title> beside the file it split", () => {
    const state = launched();
    expect(workspaceObjectiveView(state).windowPaths).toEqual([MAIN, "terminal:dev"]);
    // The layout is the shape of the tree, and a terminal leaf is still one window.
    expect(workspaceObjectiveView(state).layout).toBe("side(leaf, leaf)");
    expect(layoutText(state.tabs[0]!.root)).toBe("side(leaf, leaf)");
  });

  it("counts the terminal leaf when it indexes the focused window", () => {
    expect(focusLeafIndex(launched())).toBe(1);
  });

  it("names a zoomed terminal the way windows names it", () => {
    expect(workspaceObjectiveView(apply(launched(), "window.zoom")).zoomedPath).toBe(
      "terminal:dev",
    );
  });

  it("carries the lines the focused terminal printed, and none while a file is focused", () => {
    const ran = applyWorkspaceAction(launched(), "shell.run", { command: "npm test" });
    if (!ran.applied) throw new Error("shell.run was refused");
    expect(workspaceObjectiveView(ran.state).terminalOutput).toEqual(["Tests: 3 passed"]);

    // Focus is back on the file: no terminal is focused, so no output is the answer.
    const left = apply(ran.state, "window.focus-left");
    expect(workspaceObjectiveView(left).terminalOutput).toBeNull();
  });
});

describe("the paths each window shows, in pre-order", () => {
  it("prints one path per leaf, so two panes on the same file print it twice", () => {
    const split = apply(createWorkspace(INIT), "window.split-side-by-side");
    expect(workspaceObjectiveView(split).windowPaths).toEqual([MAIN, MAIN]);
  });

  it("names each file once a pane opens its own, and follows a swap", () => {
    const split = apply(createWorkspace(INIT), "window.split-side-by-side");
    const opened = applyWorkspaceAction(split, "file.open", { path: "src/lib/format.ts" });
    if (!opened.applied) throw new Error("file.open was refused");
    expect(workspaceObjectiveView(opened.state).windowPaths).toEqual([MAIN, "src/lib/format.ts"]);
    const swapped = apply(opened.state, "window.swap");
    expect(workspaceObjectiveView(swapped).windowPaths).toEqual(["src/lib/format.ts", MAIN]);
    expect(workspaceObjectiveView(swapped).layout).toBe("side(leaf, leaf)");
    // The files exchange places, so the focused pane now shows what its neighbour showed.
    expect(workspaceObjectiveView(swapped).activePath).toBe(MAIN);
  });
});
