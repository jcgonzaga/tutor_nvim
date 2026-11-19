import { bufferToText, splitLines } from "@tutor-nvim/vim-engine";
import type { WorkspaceBuffer, WorkspaceGrepMatch, WorkspaceState } from "./types";
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

/*
 * The picker, modelled as a deterministic query (T5c).
 *
 * A real picker is interactive and often scores its candidates, and neither is modelled here (S6):
 * the project is a fixed set of files, so a query is answered by the project itself. Every answer is
 * the first one in *path* order, never the order the disk was written in, and nothing is ranked,
 * timed or remembered between calls, so the same query against the same state gives the same state
 * and a replay is the state the recording produced.
 *
 * The query is a fragment, matched without regard to case: a learner types what they remember
 * ("util", "env"), and the model has no smart-case toggle to learn. Fuzzy subsequence matching is
 * *not* modelled — a query matches where its letters sit together — and content says so by using
 * fragments a finder would narrow on.
 */

/** The project's files in the order every query reads them: by path, so ties never depend on order. */
function projectPaths(state: WorkspaceState): readonly string[] {
  return Object.keys(state.files).sort();
}

/** Quotes a query or a path so a refusal shows exactly what was searched for or looked up. */
const quoted = (value: string): string => JSON.stringify(value);

/** Whether a path or a line holds the query, ignoring case but not gaps between the letters. */
const holdsQuery = (text: string, query: string): boolean =>
  text.toLowerCase().includes(query.toLowerCase());

/**
 * `file.find`: opens the first file in path order whose path holds the query, through the same step
 * `:e` and `file.open` use, so a finder and a path cannot reach different workspaces. No match is a
 * refusal naming the query, never a silent stay-put.
 */
export function findFile(state: WorkspaceState, query: string): FileStepResult {
  if (query === "") return { state, reason: "file.find: the query is empty" };
  const path = projectPaths(state).find((candidate) => holdsQuery(candidate, query));
  if (path === undefined) return { state, reason: `file.find: no file matches ${quoted(query)}` };
  return openFile(state, path);
}

/**
 * `grep.project`: records the matching lines of every file of the project in the state, in path
 * order and then in line order. It opens nothing: the rows are the search's answer, and opening the
 * file a row names is the learner's next, separate step. The text searched is the simulated disk,
 * not the buffers, because a project search reads files.
 */
export function grepProject(state: WorkspaceState, query: string): FileStepResult {
  if (query === "") return { state, reason: "grep.project: the query is empty" };
  const matches: WorkspaceGrepMatch[] = [];
  for (const path of projectPaths(state)) {
    const lines = splitLines(state.files[path] ?? "");
    for (const [index, text] of lines.entries()) {
      if (holdsQuery(text, query)) matches.push({ path, line: index + 1, text });
    }
  }
  if (matches.length === 0) {
    return { state, reason: `grep.project: no line matches ${quoted(query)}` };
  }
  return { state: { ...state, matches } };
}

/**
 * `buffer.list`: focuses the open buffer a path names. The list is the open set, never the project,
 * so a file that exists but is not open is a refusal naming the path instead of an open by stealth.
 */
export function listBuffer(state: WorkspaceState, path: string): FileStepResult {
  const buffer = state.buffers.find((candidate) => candidate.path === path);
  if (buffer === undefined) {
    return { state, reason: `buffer.list: no buffer is open for ${quoted(path)}` };
  }
  return { state: withActiveBuffer(state, buffer.id) };
}
