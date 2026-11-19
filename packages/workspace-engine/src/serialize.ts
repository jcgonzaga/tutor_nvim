import { bufferToText } from "@tutor-nvim/vim-engine";

import type { FocusStep, WindowNode, WorkspaceState } from "./types";
import { activeTab, leafBufferIds } from "./windows";

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
 * open buffer's text, the active path, the layout string, the focus index and the split ratios.
 *
 * Evaluation consumes this projection instead of the state itself, so it compares the same strings
 * the UI shows without a second implementation of the tree and without depending on this package's
 * internals. Field by field it mirrors `WorkspaceObjectiveState` in `@tutor-nvim/evaluation`, which
 * declares the same shape on the consumer side (T4 can re-point it when evaluation depends on the
 * engine for replay).
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
  };
}
