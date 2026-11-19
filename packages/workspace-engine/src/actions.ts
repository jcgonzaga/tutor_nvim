import {
  cycleBuffer,
  closeBuffer,
  newFile,
  openFile,
  saveActiveFile,
  type FileStepResult,
} from "./files";
import type {
  FocusStep,
  WindowLayout,
  WorkspaceActionOptions,
  WorkspaceActionResult,
  WorkspaceState,
  WorkspaceTab,
} from "./types";
import {
  activeTab,
  focusLeaf,
  lastLeafPath,
  leafNode,
  nodeAt,
  replaceAt,
  splitNode,
  withActiveTab,
  withFocus,
  withTabs,
} from "./windows";
import { openBuffer } from "./workspace";

/*
 * The actions of the workspace (S1, S2, S4, T4b).
 *
 * They are actions, never keys: the layer catalogs map a tool's keys to one of these names and
 * `packages/keymap` resolves them, so tmux's `C-b %` and Herdr's `C-b v` reach the same split, and
 * Goto-file, `n` in a file picker and `:e` reach the same `file.open`. This engine never learns what
 * a prefix is.
 *
 * Files and buffers are here for the same reason windows are (T4b): opening `src/other.ts` is one
 * thing however the learner does it, so `file.*` and `buffer.*` call the same state functions the
 * `:` command line calls, and the parity tests assert the two reach the same state.
 *
 * Every operation is total: one that cannot apply returns the state it was given, unchanged, with
 * `applied: false` and a reason. Nothing throws and nothing is a silent no-op.
 */

/** The window, tab and workspace actions of the keymap vocabulary this engine can apply. */
export const WORKSPACE_ACTIONS = [
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
] as const;
export type WorkspaceActionName = (typeof WORKSPACE_ACTIONS)[number];

/** The file and buffer actions of the keymap vocabulary this engine applies (T4b, stories 1-7). */
export const WORKSPACE_FILE_ACTIONS = [
  "file.open",
  "file.new",
  "file.save",
  "file.close-buffer",
  "buffer.next",
  "buffer.previous",
] as const;
export type WorkspaceFileActionName = (typeof WORKSPACE_FILE_ACTIONS)[number];

/**
 * Actions that need an interactive picker. The simulation models no picker (S6), so they are
 * refused with a reason that names them: what is not modelled is absent, never faked, and a story
 * that needs one waits for a picker instead of passing on an invented answer.
 */
export const WORKSPACE_PICKER_ACTIONS = ["file.find", "grep.project", "buffer.list"] as const;
export type WorkspacePickerActionName = (typeof WORKSPACE_PICKER_ACTIONS)[number];

const PICKER_ACTIONS: ReadonlySet<string> = new Set(WORKSPACE_PICKER_ACTIONS);

/** A resize is a step of the ratio, never a number of pixels, so it stays deterministic. */
const RATIO_STEP = 0.05;
const RATIO_MIN = 0.1;
const RATIO_MAX = 0.9;
/** The share a fresh split gives its first child. */
const DEFAULT_RATIO = 0.5;

const applied = (state: WorkspaceState): WorkspaceActionResult => ({ state, applied: true });
const refused = (state: WorkspaceState, reason: string): WorkspaceActionResult => ({
  state,
  applied: false,
  reason,
});
/** A shared file or buffer step in the action's own terms: applied, or refused with its reason. */
const fromStep = (step: FileStepResult): WorkspaceActionResult =>
  step.reason === undefined ? applied(step.state) : refused(step.state, step.reason);

/** The direction a focus action moves in, matched against a split's layout. */
interface Direction {
  readonly layout: WindowLayout;
  readonly towards: FocusStep;
}

export function applyWorkspaceAction(
  state: WorkspaceState,
  action: string,
  options: WorkspaceActionOptions = {},
): WorkspaceActionResult {
  switch (action) {
    case "window.split-side-by-side":
      return splitFocused(state, "side-by-side");
    case "window.split-stacked":
      return splitFocused(state, "stacked");
    case "window.close":
      return closeFocused(state);
    case "window.focus-left":
      return focusByDirection(state, action, { layout: "side-by-side", towards: "first" });
    case "window.focus-right":
      return focusByDirection(state, action, { layout: "side-by-side", towards: "second" });
    case "window.focus-up":
      return focusByDirection(state, action, { layout: "stacked", towards: "first" });
    case "window.focus-down":
      return focusByDirection(state, action, { layout: "stacked", towards: "second" });
    case "window.resize-wider":
      return resizeFocused(state, action, "side-by-side", 1);
    case "window.resize-narrower":
      return resizeFocused(state, action, "side-by-side", -1);
    case "window.resize-taller":
      return resizeFocused(state, action, "stacked", 1);
    case "window.resize-shorter":
      return resizeFocused(state, action, "stacked", -1);
    case "window.zoom":
      return toggleZoom(state);
    case "window.swap":
      return swapFocused(state);
    case "window.new":
      return newWindow(state, options);
    case "tab.new":
      return newTab(state);
    case "tab.next":
      return cycleTab(state, 1);
    case "tab.previous":
      return cycleTab(state, -1);
    case "workspace.switch":
      return switchTab(state, options);
    case "file.open":
      return openFileAction(state, options);
    case "file.new":
      return newFileAction(state, options);
    case "file.save":
      return saveFileAction(state);
    case "file.close-buffer":
      return fromStep(closeBuffer(state));
    case "buffer.next":
      return cycleBufferAction(state, action, 1);
    case "buffer.previous":
      return cycleBufferAction(state, action, -1);
    default:
      if (PICKER_ACTIONS.has(action)) {
        return refused(state, `${action}: no picker is modelled in the simulated workspace`);
      }
      return refused(state, `Unknown workspace action: ${action}`);
  }
}

/** `file.open` takes its path from the options: the simulation types no path and opens no dialog. */
function openFileAction(
  state: WorkspaceState,
  options: WorkspaceActionOptions,
): WorkspaceActionResult {
  const path = options.path;
  if (path === undefined || path === "") return refused(state, "file.open: no path given");
  return fromStep(openFile(state, path));
}

/** `file.new` creates a file the disk does not have yet; saving it is what writes it. */
function newFileAction(
  state: WorkspaceState,
  options: WorkspaceActionOptions,
): WorkspaceActionResult {
  const path = options.path;
  if (path === undefined || path === "") return refused(state, "file.new: no path given");
  return fromStep(newFile(state, path));
}

/**
 * `file.save` is applied only when there is something to save; `:w` on an unchanged buffer is a
 * write that changes nothing and is accepted, so the two agree on the state and differ only in
 * whether the action had an effect.
 */
function saveFileAction(state: WorkspaceState): WorkspaceActionResult {
  const active = state.buffers.find((buffer) => buffer.id === state.activeBufferId);
  if (active === undefined) return refused(state, "E32: No file name");
  if (!active.modified) return refused(state, "file.save: the active buffer has no changes");
  return fromStep(saveActiveFile(state));
}

/** Cycling needs somewhere to go: with one buffer open there is no other buffer to apply it to. */
function cycleBufferAction(
  state: WorkspaceState,
  action: string,
  offset: 1 | -1,
): WorkspaceActionResult {
  if (state.buffers.length < 2) return refused(state, `${action}: only one buffer is open`);
  return fromStep(cycleBuffer(state, offset));
}

/**
 * Splits the focused window in two, both showing the buffer it already showed, and focuses the new
 * pane. A split of one window therefore shows that buffer twice, exactly as tmux and nvim do; the
 * buffer is still registered once, and `:e` in either pane separates them.
 */
function splitFocused(state: WorkspaceState, layout: WindowLayout): WorkspaceActionResult {
  const tab = activeTab(state);
  const focused = tab === undefined ? undefined : focusLeaf(tab);
  if (tab === undefined || focused === undefined) {
    return refused(state, `window.split-${layout}: no focused window`);
  }
  const pane = leafNode(focused.bufferId);
  const root = replaceAt(tab.root, tab.focus, splitNode(layout, DEFAULT_RATIO, pane, pane));
  return applied(withActiveTab(state, { ...tab, root, focus: [...tab.focus, "second"] }));
}

/**
 * Closes the focused window and hands focus to its sibling's last leaf. The buffer stays open, so
 * the file is still reachable with `:bn`; only the tree and the focus change.
 */
function closeFocused(state: WorkspaceState): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined || tab.focus.length === 0) {
    return refused(state, "window.close: the last window cannot be closed");
  }
  const parentPath = tab.focus.slice(0, -1);
  const step = tab.focus[tab.focus.length - 1];
  const parent = nodeAt(tab.root, parentPath);
  if (step === undefined || parent === undefined || parent.kind !== "split") {
    return refused(state, "window.close: the focus path does not reach a split");
  }
  const sibling = step === "first" ? parent.second : parent.first;
  const root = replaceAt(tab.root, parentPath, sibling);
  return applied(
    withActiveTab(state, { ...tab, root, focus: [...parentPath, ...lastLeafPath(sibling)] }),
  );
}

/**
 * Moves focus to the window on the other side of the nearest split whose layout owns that
 * direction, walking out of nested panes as needed. A left/right key in a stacked split finds no
 * side-by-side split on the path and is refused with a reason.
 */
function focusByDirection(
  state: WorkspaceState,
  action: string,
  direction: Direction,
): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, `${action}: no active tab`);
  for (let depth = tab.focus.length - 1; depth >= 0; depth -= 1) {
    const step = tab.focus[depth];
    const ancestor = nodeAt(tab.root, tab.focus.slice(0, depth));
    if (step === undefined || ancestor === undefined || ancestor.kind === "leaf") continue;
    if (ancestor.layout !== direction.layout || step === direction.towards) continue;
    const sibling = step === "first" ? ancestor.second : ancestor.first;
    const focus = [...tab.focus.slice(0, depth), direction.towards, ...lastLeafPath(sibling)];
    return applied(withFocus(state, tab.id, focus));
  }
  return refused(state, `${action}: no ${direction.layout} split on the focus path`);
}

/**
 * Steps the nearest split of the matching layout by 0.05, refusing at the bound instead of
 * clamping: the learner is told the split cannot get any wider, not given a silent no-op.
 */
function resizeFocused(
  state: WorkspaceState,
  action: string,
  layout: WindowLayout,
  direction: 1 | -1,
): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, `${action}: no active tab`);
  for (let depth = tab.focus.length - 1; depth >= 0; depth -= 1) {
    const ancestor = nodeAt(tab.root, tab.focus.slice(0, depth));
    if (ancestor === undefined || ancestor.kind !== "split" || ancestor.layout !== layout) continue;
    const ratio = Math.round((ancestor.ratio + direction * RATIO_STEP) * 100) / 100;
    if (ratio < RATIO_MIN || ratio > RATIO_MAX) {
      const bound = direction > 0 ? "0.9" : "0.1";
      return refused(state, `${action}: the split is already at the ${bound} bound`);
    }
    const root = replaceAt(tab.root, tab.focus.slice(0, depth), { ...ancestor, ratio });
    return applied(withActiveTab(state, { ...tab, root }));
  }
  return refused(state, `${action}: no ${layout} split on the focus path`);
}

/** Zoom is a note on the state, not a shape change: pressing it again restores the layout for free. */
function toggleZoom(state: WorkspaceState): WorkspaceActionResult {
  if (state.zoom !== null) return applied({ ...state, zoom: null });
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, "window.zoom: no focused window");
  return applied({ ...state, zoom: { tabId: tab.id, leafPath: [...tab.focus] } });
}

/** Exchanges the focused window's buffer with the nearest sibling leaf's: shape and ratios stay. */
function swapFocused(state: WorkspaceState): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, "window.swap: no active tab");
  const focused = nodeAt(tab.root, tab.focus);
  for (let depth = tab.focus.length - 1; depth >= 0; depth -= 1) {
    const step = tab.focus[depth];
    const ancestor = nodeAt(tab.root, tab.focus.slice(0, depth));
    if (step === undefined || ancestor === undefined || ancestor.kind !== "split") continue;
    const sibling = step === "first" ? ancestor.second : ancestor.first;
    const counterpartPath = [
      ...tab.focus.slice(0, depth),
      step === "first" ? ("second" as const) : ("first" as const),
      ...lastLeafPath(sibling),
    ];
    const counterpart = nodeAt(tab.root, counterpartPath);
    if (focused === undefined || focused.kind !== "leaf" || counterpart?.kind !== "leaf") continue;
    const root = replaceAt(
      replaceAt(tab.root, counterpartPath, leafNode(focused.bufferId)),
      tab.focus,
      leafNode(counterpart.bufferId),
    );
    return applied(withActiveTab(state, { ...tab, root }));
  }
  return refused(state, "window.swap: the tab has a single window");
}

/**
 * Opens a file in a new pane beside the focused one. No application is launched: the simulation
 * opens files (S6), so a `window.new` without a path is refused with a reason, and a path that is
 * not on the simulated disk is refused with the message `:e` gives.
 */
function newWindow(state: WorkspaceState, options: WorkspaceActionOptions): WorkspaceActionResult {
  const path = options.path;
  if (path === undefined) {
    return refused(
      state,
      "window.new: no path to open: the simulated workspace opens files, not applications",
    );
  }
  if (state.files[path] === undefined) return refused(state, `E484: Can't open file ${path}`);
  const tab = activeTab(state);
  const focused = tab === undefined ? undefined : focusLeaf(tab);
  if (tab === undefined || focused === undefined)
    return refused(state, "window.new: no focused window");
  const existing = state.buffers.find((buffer) => buffer.path === path);
  const buffer = existing ?? openBuffer(state.files, path);
  const buffers = existing === undefined ? [...state.buffers, buffer] : state.buffers;
  const root = replaceAt(
    tab.root,
    tab.focus,
    splitNode("side-by-side", DEFAULT_RATIO, leafNode(focused.bufferId), leafNode(buffer.id)),
  );
  const next = withActiveTab(state, { ...tab, root, focus: [...tab.focus, "second"] });
  return applied({ ...next, buffers });
}

/** A new tab starts as one window on the buffer that was active, and takes the keys. */
function newTab(state: WorkspaceState): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, "tab.new: no active tab");
  const created: WorkspaceTab = {
    id: nextTabId(state.tabs),
    root: leafNode(state.activeBufferId),
    focus: [],
  };
  return applied(withTabs(state, [...state.tabs, created], created.id));
}

/** Tab ids come from the position in the state, so the same script gives the same ids. */
function nextTabId(tabs: readonly WorkspaceTab[]): string {
  let index = tabs.length + 1;
  while (tabs.some((tab) => tab.id === `tab:${index}`)) index += 1;
  return `tab:${index}`;
}

/** `tab.next` and `tab.previous`, wrapping around like `:bn` and `:bp` do. */
function cycleTab(state: WorkspaceState, offset: 1 | -1): WorkspaceActionResult {
  const current = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
  if (current < 0 || state.tabs.length < 2) return applied(state);
  const target = state.tabs[(current + offset + state.tabs.length) % state.tabs.length];
  if (target === undefined) return applied(state);
  return applied(withTabs(state, state.tabs, target.id));
}

/** `workspace.switch` selects the tab in its options; with none it falls back to cycling. */
function switchTab(state: WorkspaceState, options: WorkspaceActionOptions): WorkspaceActionResult {
  if (options.tabId === undefined) return cycleTab(state, 1);
  const target = state.tabs.find((tab) => tab.id === options.tabId);
  if (target === undefined)
    return refused(state, `workspace.switch: no tab named ${options.tabId}`);
  return applied(withTabs(state, state.tabs, target.id));
}
