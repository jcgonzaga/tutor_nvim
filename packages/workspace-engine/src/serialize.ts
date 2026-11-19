import { bufferToText } from "@tutor-nvim/vim-engine";

import type { FocusStep, WindowNode, WorkspaceGrepMatch, WorkspaceState } from "./types";
import { activeTab, leafBufferIds, nodeAt } from "./windows";

/*
 * Printing the window tree (T3). An objective asserts the shape of the workspace, and the layout is
 * not a second grammar in content: it is the string this module prints, `leaf` for a window and
 * `side(a, b)` / `stacked(a, b)` for a split, so there is one implementation of "what shape is
 * this" and content reads exactly what a person would draw.
 *
 * Everything here is pure and total: a state that keeps the engine's invariants always prints, and
 * a helper that cannot find what it was asked for returns `undefined` instead of throwing.
 */

/**
 * The tree in pre-order: `leaf`, `side(leaf, leaf)`, `stacked(leaf, side(leaf, leaf))`.
 *
 * The layout names the result, not the gesture, for the same reason the engine's `WindowLayout`
 * does: tmux `%` leaves panes side by side while Neovim `:split` stacks windows.
 */
export function layoutText(node: WindowNode): string {
  if (node.kind === "leaf") return "leaf";
  const layout = node.layout === "side-by-side" ? "side" : "stacked";
  return `${layout}(${layoutText(node.first)}, ${layoutText(node.second)})`;
}

/**
 * The index of the focused leaf, counted in pre-order from 0.
 *
 * The index is derived from the focus *path*, not from the focused buffer: a split shows the same
 * buffer in both panes, so looking the buffer up would answer "the first one".
 */
export function focusLeafIndex(state: WorkspaceState): number | undefined {
  const tab = activeTab(state);
  return tab === undefined ? undefined : leafIndexAt(tab.root, tab.focus);
}

/** Leaves before the leaf at `path`, or `undefined` when the path does not reach a leaf. */
function leafIndexAt(node: WindowNode, path: readonly FocusStep[]): number | undefined {
  const [step, ...rest] = path;
  if (step === undefined) return node.kind === "leaf" ? 0 : undefined;
  if (node.kind === "leaf") return undefined;
  if (step === "first") return leafIndexAt(node.first, rest);
  const inSecond = leafIndexAt(node.second, rest);
  return inSecond === undefined ? undefined : leafBufferIds(node.first).length + inSecond;
}

/** Every split's ratio in pre-order, so `split_ratio` can address one by index. */
export function splitRatios(node: WindowNode): readonly number[] {
  return node.kind === "leaf"
    ? []
    : [node.ratio, ...splitRatios(node.first), ...splitRatios(node.second)];
}

/** One open buffer as an objective sees it: the path it holds and the text it holds. */
export interface WorkspaceObjectiveBuffer {
  readonly path: string;
  readonly text: string;
}

/**
 * The state an objective is judged against, already printed by the functions above: files, every
 * open buffer's text, the active path, the layout string, the focus index, the split ratios and the
 * rows the last project search recorded.
 *
 * Evaluation consumes this projection instead of the state itself, so it compares the same strings
 * the UI shows without a second implementation of the tree and without depending on this package's
 * internals.
 */
export interface WorkspaceObjectiveView {
  /** The simulated disk: path -> text, as `file_text` asserts it. */
  readonly files: Readonly<Record<string, string>>;
  /** Open buffers in the order they were opened, whatever window shows them. */
  readonly buffers: readonly WorkspaceObjectiveBuffer[];
  /** Path of the active buffer; `undefined` only in a state that broke the "never empty" invariant. */
  readonly activePath: string | undefined;
  /** `layoutText` of the active tab; `""` only in a state without an active tab. */
  readonly layout: string;
  /** Pre-order index of the focused leaf; `undefined` when the focus path misses a leaf. */
  readonly focus: number | undefined;
  /** Pre-order ratios of the active tab. */
  readonly splitRatios: readonly number[];
  /**
   * The path the zoomed window shows, `null` when nothing is zoomed. Zoom is a note on the state
   * and never a shape of the tree, so a story that zooms and one that does nothing print the same
   * layout: this is the field that tells them apart.
   */
  readonly zoomedPath: string | null;
  /**
   * The path each leaf shows, in pre-order: one entry per window, so two panes on the same file
   * print it twice. `open_buffers` is the set of what is loaded and cannot say which pane shows
   * what; this is the projection a split, a swap or a close is visible in.
   */
  readonly windowPaths: readonly string[];
  /** The rows `grep.project` recorded, in project order, as `grep_matches` asserts them. */
  readonly matches: readonly WorkspaceGrepMatch[];
}

export function workspaceObjectiveView(state: WorkspaceState): WorkspaceObjectiveView {
  const tab = activeTab(state);
  return {
    files: state.files,
    buffers: state.buffers.map((buffer) => ({
      path: buffer.path,
      text: bufferToText(buffer.editor.buffer),
    })),
    activePath: state.buffers.find((buffer) => buffer.id === state.activeBufferId)?.path,
    layout: tab === undefined ? "" : layoutText(tab.root),
    focus: focusLeafIndex(state),
    splitRatios: tab === undefined ? [] : splitRatios(tab.root),
    zoomedPath: zoomedPath(state),
    windowPaths: windowPaths(state),
    matches: state.matches.map((match) => ({
      path: match.path,
      line: match.line,
      text: match.text,
    })),
  };
}

/**
 * The path each leaf of the active tab shows, in pre-order (T6).
 *
 * The tree, not the buffer list: a split shows the same buffer in both panes and a swap re-points
 * two leaves without opening anything, so the buffers say what is loaded and this says what is on
 * screen, pane by pane.
 */
export function windowPaths(state: WorkspaceState): readonly string[] {
  const tab = activeTab(state);
  if (tab === undefined) return [];
  return leafBufferIds(tab.root).map(
    (bufferId) => state.buffers.find((buffer) => buffer.id === bufferId)?.path ?? "",
  );
}

/**
 * The path of the window a `window.zoom` selected, or `null` when nothing is zoomed (T6).
 *
 * The zoom is a note beside the tree (`WorkspaceZoom`), so this resolves it to the buffer the pane
 * shows: a story says "the file you zoomed", never a path inside the split. A zoom whose tab or leaf
 * no longer exists reads as `null`, the same way `pruneZoom` drops it from the state.
 */
export function zoomedPath(state: WorkspaceState): string | null {
  const zoom = state.zoom;
  if (zoom === null) return null;
  const tab = state.tabs.find((candidate) => candidate.id === zoom.tabId);
  if (tab === undefined) return null;
  const node = nodeAt(tab.root, zoom.leafPath);
  if (node === undefined || node.kind !== "leaf") return null;
  return state.buffers.find((buffer) => buffer.id === node.bufferId)?.path ?? null;
}
