import { dispatch, type KeyInput } from "@tutor-nvim/vim-engine";
import { runInFocusedTerminal, stateRefusal, withTerminal } from "./actions";
import { runCommandLine } from "./commands";
import type {
  PendingWorkspaceCommand,
  TerminalWindow,
  WorkspaceDispatchResult,
  WorkspaceState,
  WorkspaceTerminal,
} from "./types";
import { activeTab, focusedNode } from "./windows";
import { withEditor } from "./workspace";

/**
 * One key of the workspace. Pure and total: the same `(state, key)` always gives the same result and
 * a key nothing knows is rejected, never thrown on.
 *
 * Two keys are the workspace's own before the editor sees them (AGENTS.md 2.9 for the modifiers):
 * `:` in NORMAL mode opens the command line, and everything typed there belongs to the command line
 * until Enter or Esc. Every other key reaches the active buffer's editor through `vim-engine`'s
 * `dispatch` unchanged, so there is only one answer to "what does `ci" do".
 *
 * A terminal window has no buffer behind it but has a prompt in front of it (T7a3, story 19): while
 * one has the keys, the keys edit that session's own command line instead. It is the same idea as
 * `:`, with the session as the thing being typed at, and Enter reaches the very body `shell.run`
 * uses.
 */

const hasCommandModifiers = (input: KeyInput): boolean =>
  input.ctrl === true || input.alt === true || input.meta === true;

/** A single typed character (one code point), as the Vim engine defines it. */
const isPrintable = (input: KeyInput): boolean =>
  !hasCommandModifiers(input) && [...input.key].length === 1;

/**
 * The action a terminal's prompt answers to (T7a3).
 *
 * Typing at a session is running a command in it, so the prompt asks the gate under `shell.run`'s
 * name: a frozen or resizing workspace refuses a typed character with the very words it refuses the
 * action, because both read the refusal from `stateRefusal` instead of spelling it twice.
 */
const TERMINAL_ACTION = "shell.run";

export function dispatchWorkspace(state: WorkspaceState, input: KeyInput): WorkspaceDispatchResult {
  if (state.pending !== null) return dispatchCommandLine(state, state.pending, input);

  const tab = activeTab(state);
  const leaf = tab === undefined ? undefined : focusedNode(tab);
  // A terminal leaf routes on what the window shows, not on the active buffer: the buffer behind it
  // is still the file the learner left, and typing must never land there (T7a3).
  if (leaf !== undefined && leaf.kind === "terminal") {
    return dispatchTerminalLine(state, leaf, input);
  }

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

/**
 * One key on the focused terminal's command line (T7a3): printable keys append, Backspace removes the
 * last character, Esc clears the line and Enter runs it. The line is the session's own, so a second
 * terminal keeps whatever was typed into it.
 *
 * A refused Enter leaves the line exactly as it was: a command the exercise never declared is
 * something to correct, and a prompt that swallowed it would be a log pretending to be a prompt.
 */
function dispatchTerminalLine(
  state: WorkspaceState,
  leaf: TerminalWindow,
  input: KeyInput,
): WorkspaceDispatchResult {
  const frozen = stateRefusal(state, TERMINAL_ACTION);
  if (frozen !== null) return { state, accepted: false, reason: frozen };

  const terminal = state.terminals.find((candidate) => candidate.id === leaf.terminalId);
  // A terminal leaf without a session is a state that broke an invariant: no key reaches it.
  if (terminal === undefined) return { state, accepted: false };

  // A modified key is not part of a command line: it is neither typed nor a prompt keystroke.
  if (hasCommandModifiers(input)) return { state, accepted: false };
  if (input.key === "Escape") {
    // Esc on an empty line has nothing to clear: the key is consumed, and the state is not rewritten.
    if (terminal.pending === "") return { state, accepted: true };
    return { state: withPending(state, terminal, ""), accepted: true };
  }
  if (input.key === "Backspace") {
    // Backspace on an empty line stays empty, for the same reason: consumed, nothing rewritten.
    if (terminal.pending === "") return { state, accepted: true };
    return {
      state: withPending(state, terminal, terminal.pending.slice(0, -1)),
      accepted: true,
    };
  }
  if (input.key === "Enter") return runTerminalLine(state, terminal);
  if (isPrintable(input)) {
    return {
      state: withPending(state, terminal, terminal.pending + input.key),
      accepted: true,
    };
  }
  return { state, accepted: false };
}

/** The state with a terminal's prompt set to `pending`; the same terminal list, one session rewritten. */
function withPending(
  state: WorkspaceState,
  terminal: WorkspaceTerminal,
  pending: string,
): WorkspaceState {
  return withTerminal(state, { ...terminal, pending });
}

/**
 * Enter on the prompt: run what was typed through the body `shell.run` uses, then clear the line.
 *
 * An empty line is a refusal with its own reason — the learner asked to run nothing, and the `:`
 * command line's silent "close on Enter" would here be a prompt that answered nothing at all.
 */
function runTerminalLine(
  state: WorkspaceState,
  terminal: WorkspaceTerminal,
): WorkspaceDispatchResult {
  if (terminal.pending.trim() === "") {
    return { state, accepted: false, reason: "shell.run: the terminal line is empty" };
  }
  const run = runInFocusedTerminal(state, terminal.pending);
  if (!run.applied) return { state: run.state, accepted: false, reason: run.reason };
  const ran = run.state.terminals.find((candidate) => candidate.id === terminal.id);
  return {
    state: ran === undefined ? run.state : withPending(run.state, ran, ""),
    accepted: true,
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
