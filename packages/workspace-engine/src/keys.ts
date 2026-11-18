import { dispatch, type KeyInput } from "@tutor-nvim/vim-engine";
import { runCommandLine } from "./commands";
import type { PendingWorkspaceCommand, WorkspaceDispatchResult, WorkspaceState } from "./types";
import { withEditor } from "./workspace";

/**
 * One key of the workspace. Pure and total: the same `(state, key)` always gives the same result and
 * a key nothing knows is rejected, never thrown on.
 *
 * Two keys are the workspace's own before the editor sees them (AGENTS.md 2.9 for the modifiers):
 * `:` in NORMAL mode opens the command line, and everything typed there belongs to the command line
 * until Enter or Esc. Every other key reaches the active buffer's editor through `vim-engine`'s
 * `dispatch` unchanged, so there is only one answer to "what does `ci" do".
 */

const hasCommandModifiers = (input: KeyInput): boolean =>
  input.ctrl === true || input.alt === true || input.meta === true;

/** A single typed character (one code point), as the Vim engine defines it. */
const isPrintable = (input: KeyInput): boolean =>
  !hasCommandModifiers(input) && [...input.key].length === 1;

export function dispatchWorkspace(state: WorkspaceState, input: KeyInput): WorkspaceDispatchResult {
  if (state.pending !== null) return dispatchCommandLine(state, state.pending, input);

  const buffer = state.buffers.find((candidate) => candidate.id === state.activeBufferId);
  if (buffer === undefined) return { state, accepted: false };

  // `:` opens the command line in NORMAL mode; in INSERT mode it is text and reaches the editor.
  if (input.key === ":" && !hasCommandModifiers(input) && buffer.editor.mode === "normal") {
    // Vim cancels a half-typed operator when a command line opens: leaving `d` armed behind a saved
    // file would make the next key in the editor delete something the learner never asked for.
    const cancelled = buffer.editor.pending === null
      ? buffer.editor
      : dispatch(buffer.editor, { key: "Escape" }).state;
    const buffers =
      cancelled === buffer.editor
        ? state.buffers
        : state.buffers.map((candidate) =>
            candidate.id === buffer.id ? withEditor(state.files, candidate, cancelled) : candidate,
          );
    return {
      state: { ...state, buffers, pending: { kind: "command-line", text: "" } },
      accepted: true,
    };
  }

  const result = dispatch(buffer.editor, input);
  if (result.state === buffer.editor) return { state, accepted: result.accepted };
  return {
    state: {
      ...state,
      buffers: state.buffers.map((candidate) =>
        candidate.id === buffer.id ? withEditor(state.files, candidate, result.state) : candidate,
      ),
    },
    accepted: result.accepted,
  };
}

function dispatchCommandLine(
  state: WorkspaceState,
  pending: PendingWorkspaceCommand,
  input: KeyInput,
): WorkspaceDispatchResult {
  // A modified key (Ctrl/Alt/Meta) is not part of a command line: the pending line is kept as it is.
  if (hasCommandModifiers(input)) return { state, accepted: false };
  if (input.key === "Escape") return { state: { ...state, pending: null }, accepted: true };
  if (input.key === "Enter") return runCommandLine({ ...state, pending: null }, pending.text);
  if (input.key === "Backspace") {
    return {
      state: { ...state, pending: { ...pending, text: pending.text.slice(0, -1) } },
      accepted: true,
    };
  }
  if (isPrintable(input)) {
    return {
      state: { ...state, pending: { ...pending, text: pending.text + input.key } },
      accepted: true,
    };
  }
  return { state, accepted: false };
}

/** Folds a recorded sequence over a state: the entry point for replays and tests. */
export function runWorkspaceKeys(state: WorkspaceState, keys: readonly KeyInput[]): WorkspaceState {
  return keys.reduce((current, input) => dispatchWorkspace(current, input).state, state);
}
