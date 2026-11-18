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
 * Window, tab and workspace operations (S2, S4).
 *
 * They are actions, never keys: the layer catalogs map a tool's keys to one of these names and
 * `packages/keymap` resolves them, so tmux's `C-b %` and Herdr's `C-b v` reach the same split and
 * this engine never learns what a prefix is. That is the point of the T2 design, not a compromise.
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
    default:
      return refused(state, `Unknown workspace action: ${action}`);
  }
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
