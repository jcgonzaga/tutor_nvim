import { bufferToText } from "@tutor-nvim/vim-engine";
import type { WorkspaceBuffer, WorkspaceState } from "./types";
import { openBuffer, withEditor } from "./workspace";
import { replaceBuffer, withActiveBuffer, withTabs } from "./windows";

/*
 * The file and buffer operations of the workspace (S1, T4b).
 *
 * Both entry points share them, and that is the point: `:e <path>` and `file.open`, `:w` and
 * `file.save`, `:bn`/`:bp` and `buffer.next`/`buffer.previous` each reach the state through the same
 * function here, so a learner who opens a file with Goto-file and one who types `:e` cannot end up in
 * two different states. The command line owns the parsing (an extra argument, a missing one, a name
 * it does not know) and turns a refusal into its own record; these functions own the state change and
 * the words the refusal is reported in, Vim's own where Vim has them.
 *
 * No clock, no I/O, no randomness: a buffer id comes from its path, so a replay is the same state.
 */

/** What a file or buffer operation did, and why it changed nothing when it did not. */
export interface FileStepResult {
  readonly state: WorkspaceState;
  /** Present when nothing changed: the refusal in the words the learner sees. */
  readonly reason?: string;
}

/** The buffer holding the keys, or `undefined` when the state breaks its "never empty" invariant. */
function activeBufferOf(state: WorkspaceState): WorkspaceBuffer | undefined {
  return state.buffers.find((buffer) => buffer.id === state.activeBufferId);
}

/**
 * Opens a path, focusing the buffer that already shows it instead of registering it twice. A path
 * that is not on the simulated disk is refused with Vim's own message rather than faked (S6).
 */
export function openFile(state: WorkspaceState, path: string): FileStepResult {
  if (path === "") return { state, reason: "E32: No file name" };
  const existing = state.buffers.find((buffer) => buffer.path === path);
  if (existing !== undefined) return { state: withActiveBuffer(state, existing.id) };
  if (state.files[path] === undefined) {
    return { state, reason: `E484: Can't open file ${path}` };
  }
  const buffer = openBuffer(state.files, path);
  return {
    state: withActiveBuffer({ ...state, buffers: [...state.buffers, buffer] }, buffer.id),
  };
}

/**
 * Opens an empty buffer for a path the disk does not have yet: the file itself appears when the
 * buffer is saved. A path that exists, or a buffer already open on it, is refused instead of
 * silently reusing or duplicating it.
 */
export function newFile(state: WorkspaceState, path: string): FileStepResult {
  if (path === "") return { state, reason: "E32: No file name" };
  if (state.files[path] !== undefined) return { state, reason: `file.new: ${path} already exists` };
  if (state.buffers.some((buffer) => buffer.path === path)) {
    return { state, reason: `file.new: ${path} is already open` };
  }
  const buffer = openBuffer(state.files, path);
  return {
    state: withActiveBuffer({ ...state, buffers: [...state.buffers, buffer] }, buffer.id),
  };
}

/**
 * Writes the active buffer into the simulated disk and clears `modified`, which is derived from the
 * text, so undoing back to the saved text clears it again. The file is the only thing written: no
 * real filesystem is touched.
 */
export function saveActiveFile(state: WorkspaceState): FileStepResult {
  const active = activeBufferOf(state);
  if (active === undefined) return { state, reason: "E32: No file name" };
  const files = { ...state.files, [active.path]: bufferToText(active.editor.buffer) };
  const written = withEditor(files, active, active.editor);
  return {
    state: {
      ...state,
      files,
      buffers: state.buffers.map((buffer) => (buffer.id === active.id ? written : buffer)),
    },
  };
}

/**
 * Closes the active buffer, leaving the file on disk. Closing a buffer is not closing a window: the
 * panes stay and every window that showed this buffer shows the buffer that takes its place instead
 * (the next one in open order, or the previous one when it was the last). The last buffer is refused
 * because the state always has one to hold the keys.
 */
export function closeBuffer(state: WorkspaceState): FileStepResult {
  const active = activeBufferOf(state);
  if (active === undefined) return { state, reason: "E32: No file name" };
  const index = state.buffers.findIndex((buffer) => buffer.id === active.id);
  const remaining = state.buffers.filter((buffer) => buffer.id !== active.id);
  if (remaining.length === 0) {
    return { state, reason: "file.close-buffer: the last buffer cannot be closed" };
  }
  const fallback = remaining[Math.min(index, remaining.length - 1)];
  if (fallback === undefined) return { state, reason: "E32: No file name" };
  const tabs = state.tabs.map((tab) => ({
    ...tab,
    root: replaceBuffer(tab.root, active.id, fallback.id),
  }));
  return { state: withTabs({ ...state, buffers: remaining }, tabs, state.activeTabId) };
}

/**
 * Moves to the next or previous buffer in open order, wrapping around like `:bn` and `:bp` do. With a
 * single buffer the wrap lands on that same buffer and nothing changes; whether that counts as
 * applied is the caller's rule (`:bn` ran, `buffer.next` has nowhere to go).
 */
export function cycleBuffer(state: WorkspaceState, offset: 1 | -1): FileStepResult {
  const current = state.buffers.findIndex((buffer) => buffer.id === state.activeBufferId);
  if (current < 0) return { state, reason: "E32: No file name" };
  const count = state.buffers.length;
  const target = state.buffers[(((current + offset) % count) + count) % count];
  if (target === undefined) return { state, reason: "E32: No file name" };
  return { state: withActiveBuffer(state, target.id) };
}
