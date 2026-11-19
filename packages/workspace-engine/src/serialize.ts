import { bufferToText } from "@tutor-nvim/vim-engine";

import type {
  FocusStep,
  WindowNode,
  WindowLeaf,
  WorkspaceGrepMatch,
  WorkspaceMode,
  WorkspaceState,
} from "./types";
import { activeTab, focusedNode, isLeafNode, leafNodes, nodeAt } from "./windows";

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
 *
 * A terminal leaf prints as `leaf` too (T7a1): the layout is the *shape* of the tree, and a window
 * showing a session is one window like any other. What it shows is `windowPaths`' answer, which
 * names a terminal `terminal:<title>`, so a story asserting the shape and a story asserting the
 * content never have to share one grammar.
 */
export function layoutText(node: WindowNode): string {
  if (node.kind !== "split") return "leaf";
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
  if (step === undefined) return isLeafNode(node) ? 0 : undefined;
  if (isLeafNode(node)) return undefined;
  if (step === "first") return leafIndexAt(node.first, rest);
  const inSecond = leafIndexAt(node.second, rest);
  return inSecond === undefined ? undefined : leafNodes(node.first).length + inSecond;
}

/** Every split's ratio in pre-order, so `split_ratio` can address one by index. */
export function splitRatios(node: WindowNode): readonly number[] {
  return isLeafNode(node)
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
   *
   * A terminal leaf prints as `terminal:<title>` (T7a1): it shows a session, not a file, so a story
   * can assert the shape of its desktop without a second grammar and without pretending a file is
   * on screen.
   */
  readonly windowPaths: readonly string[];
  /**
   * The lines the focused terminal printed, and `null` when the focused window is a file (T7a1).
   *
   * `null` is the honest answer and not an empty list: a file window printed nothing because there
   * is no terminal there, and a goal that confused the two would pass on the wrong screen.
   */
  readonly terminalOutput: readonly string[] | null;
  /**
   * Whether the session is frozen (T7a2): `session.detach` sets it and `session.attach` clears it,
   * and nothing else in this projection changes while it is on. A story asserts it as `session`.
   */
  readonly detached: boolean;
  /**
   * The input mode, ordinary or resize (T7a2). It is a field beside the tree, so the layout above is
   * the same whether a learner resized in resize mode or never entered it; a story asserts it as
   * `mode`.
   */
  readonly mode: WorkspaceMode;
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
    terminalOutput: focusedTerminalOutput(state),
    detached: state.detached,
    mode: state.mode,
    matches: state.matches.map((match) => ({
      path: match.path,
      line: match.line,
      text: match.text,
    })),
  };
}

/**
 * The path each leaf of the active tab shows, in pre-order (T6, T7a1).
 *
 * The tree, not the buffer list: a split shows the same buffer in both panes and a swap re-points
 * two leaves without opening anything, so the buffers say what is loaded and this says what is on
 * screen, pane by pane. A terminal leaf prints `terminal:<title>`, the way its window is labelled.
 */
export function windowPaths(state: WorkspaceState): readonly string[] {
  const tab = activeTab(state);
  if (tab === undefined) return [];
  return leafNodes(tab.root).map((leaf) => leafLabel(state, leaf));
}

/**
 * What one window shows, as the projections print it: the path of its file, or `terminal:<title>`.
 *
 * One function for both printers, so `windows` and `zoom` can never disagree about how a window is
 * named.
 */
function leafLabel(state: WorkspaceState, leaf: WindowLeaf): string {
  if (leaf.kind === "leaf") {
    return state.buffers.find((buffer) => buffer.id === leaf.bufferId)?.path ?? "";
  }
  // A leaf naming a terminal the state does not hold is a state that broke an invariant; printing
  // its id at least names what the window points at instead of pretending it is empty.
  const title = state.terminals.find((terminal) => terminal.id === leaf.terminalId)?.title;
  return `terminal:${title ?? leaf.terminalId}`;
}

/**
 * The lines the focused terminal printed, or `null` when the focused window is not a terminal.
 *
 * The scrollback is every entry's output in the order it ran, because "what did this terminal
 * print" is the session a person scrolled through, never only its last command. A leaf whose
 * terminal is missing from `state.terminals` broke an invariant and reads as a session that printed
 * nothing.
 */
export function focusedTerminalOutput(state: WorkspaceState): readonly string[] | null {
  const tab = activeTab(state);
  const node = tab === undefined ? undefined : focusedNode(tab);
  if (node === undefined || node.kind !== "terminal") return null;
  const terminal = state.terminals.find((candidate) => candidate.id === node.terminalId);
  if (terminal === undefined) return [];
  return terminal.entries.flatMap((entry) => entry.output);
}

/**
 * The path of the window a `window.zoom` selected, or `null` when nothing is zoomed (T6).
 *
 * The zoom is a note beside the tree (`WorkspaceZoom`), so this resolves it to the buffer the pane
 * shows: a story says "the file you zoomed", never a path inside the split. A zoom whose tab or leaf
 * no longer exists reads as `null`, the same way `pruneZoom` drops it from the state. A zoomed
 * terminal prints the label `windows` prints for it (`terminal:<title>`), so the two goals name a
 * window the same way.
 */
export function zoomedPath(state: WorkspaceState): string | null {
  const zoom = state.zoom;
  if (zoom === null) return null;
  const tab = state.tabs.find((candidate) => candidate.id === zoom.tabId);
  if (tab === undefined) return null;
  const node = nodeAt(tab.root, zoom.leafPath);
  if (node === undefined || node.kind === "split") return null;
  return leafLabel(state, node);
}
