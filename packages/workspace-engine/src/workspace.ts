import { bufferToText, createVimState, splitLines } from "@tutor-nvim/vim-engine";
import type {
  WorkspaceBuffer,
  WorkspaceCommandResult,
  WorkspaceInit,
  WorkspaceState,
  WorkspaceTab,
} from "./types";
import { leafNode } from "./windows";

/*
 * The simulated workspace around the text: files, open buffers and which one is active. Everything
 * about the text itself (cursor, modes, undo, repeat) is `vim-engine`'s; this module only creates
 * buffers and reads the state back out for a caller.
 *
 * No clock, no I/O, no id from randomness: a buffer id is derived from its path, so replaying the
 * same keys against the same input gives the same state.
 */

/**
 * Stable id of the buffer for a path: `src/main.ts` is `buf:src/main.ts`. A path is the key of the
 * simulated disk, used verbatim, so the id never depends on a clock or on randomness.
 */
export const bufferId = (path: string): string => `buf:${path}`;

const diskText = (files: Readonly<Record<string, string>>, path: string): string =>
  files[path] ?? "";

export function createWorkspace(input: WorkspaceInit): WorkspaceState {
  const files = { ...input.files };
  const buffer = openBuffer(files, input.path);
  // One tab of one window, focus at its root: a window tree with a single leaf is still a tree.
  const tab: WorkspaceTab = { id: "tab:1", root: leafNode(buffer.id), focus: [] };
  return {
    files,
    cwd: input.cwd,
    buffers: [buffer],
    activeBufferId: buffer.id,
    // No project search has run yet; the rows arrive with `grep.project` (T5c).
    matches: [],
    tabs: [tab],
    activeTabId: tab.id,
    zoom: null,
    // Attached and in the ordinary input mode until an action says otherwise (T7a2).
    detached: false,
    mode: "normal",
    pending: null,
    lastCommand: null,
    // The declaration is carried, not opened: `app.launch-terminal` is what creates a session, so
    // an exercise that never launches one never has a terminal window (T7a1).
    declaredTerminal: input.terminal ?? null,
    terminals: [],
  };
}

/**
 * Opens a buffer for a path. The text comes from the simulated disk; a path that is not there yet
 * opens empty and unmodified, and only `:w` creates the file.
 */
export function openBuffer(files: Readonly<Record<string, string>>, path: string): WorkspaceBuffer {
  return {
    id: bufferId(path),
    path,
    editor: createVimState({ lines: splitLines(diskText(files, path)) }),
    modified: false,
  };
}

/** The same buffer with a new editor state; `modified` is derived, so undo back to the file clears it. */
export function withEditor(
  files: Readonly<Record<string, string>>,
  buffer: WorkspaceBuffer,
  editor: WorkspaceBuffer["editor"],
): WorkspaceBuffer {
  return {
    ...buffer,
    editor,
    modified: bufferToText(editor.buffer) !== diskText(files, buffer.path),
  };
}

/** The buffer holding the keys. Throws only if the "never empty" invariant of the state is broken. */
export function activeBuffer(state: WorkspaceState): WorkspaceBuffer {
  const buffer = state.buffers.find((candidate) => candidate.id === state.activeBufferId);
  if (buffer === undefined) {
    throw new Error(`Workspace has no active buffer: ${state.activeBufferId}`);
  }
  return buffer;
}

/** The open buffer for a path, or `undefined` when that file is not open. */
export function bufferByPath(state: WorkspaceState, path: string): WorkspaceBuffer | undefined {
  return state.buffers.find((buffer) => buffer.path === path);
}

/** Whether a buffer differs from its file. Unknown ids are not modified. */
export function isBufferModified(state: WorkspaceState, bufferIdValue: string): boolean {
  return state.buffers.find((buffer) => buffer.id === bufferIdValue)?.modified ?? false;
}

/** Paths of the open buffers, in the order they were opened. */
export function openBufferPaths(state: WorkspaceState): readonly string[] {
  return state.buffers.map((buffer) => buffer.path);
}

/** The result of the last command line that ran, or `null` before the first one. */
export function lastCommandResult(state: WorkspaceState): WorkspaceCommandResult | null {
  return state.lastCommand;
}
