import { promptOf, runCommandLine, type ShellState } from "./shell";

/** Same shape as the Vim engine's input so telemetry and replay treat both alike. */
export interface ShellKeyInput {
  readonly key: string;
  readonly code?: string;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
  readonly meta?: boolean;
  readonly timestamp?: number;
}

export interface ShellKeyResult {
  readonly state: ShellState;
  /** False for a key the terminal ignores (an unsupported shortcut). */
  readonly accepted: boolean;
}

/**
 * One key of the terminal: printable characters extend the line, Backspace edits it, Enter runs it,
 * Up/Down browse the history, Ctrl+U clears the line and Ctrl+C abandons it. Tab completion and
 * cursor movement inside the line are not simulated yet.
 */
export function dispatchShellKey(state: ShellState, input: ShellKeyInput): ShellKeyResult {
  const { key } = input;
  const accept = (next: ShellState): ShellKeyResult => ({ state: next, accepted: true });

  if (input.ctrl) {
    if (key === "u") return accept({ ...state, line: "", historyIndex: null });
    if (key === "c") {
      const entry = { prompt: promptOf(state), command: `${state.line}^C`, output: "" };
      return accept({
        ...state,
        line: "",
        historyIndex: null,
        status: 130,
        transcript: [...state.transcript, entry],
      });
    }
    return { state, accepted: false };
  }
  if (input.alt || input.meta) return { state, accepted: false };

  switch (key) {
    case "Enter":
      return accept(runCommandLine(state, state.line));
    case "Backspace":
      return accept({ ...state, line: state.line.slice(0, -1) });
    case "ArrowUp": {
      if (state.history.length === 0) return accept(state);
      const index =
        state.historyIndex === null
          ? state.history.length - 1
          : Math.max(0, state.historyIndex - 1);
      return accept({ ...state, historyIndex: index, line: state.history[index] as string });
    }
    case "ArrowDown": {
      if (state.historyIndex === null) return accept(state);
      const index = state.historyIndex + 1;
      return index >= state.history.length
        ? accept({ ...state, historyIndex: null, line: "" })
        : accept({ ...state, historyIndex: index, line: state.history[index] as string });
    }
    default:
      // A single character (letters, digits, punctuation, space).
      if ([...key].length === 1)
        return accept({ ...state, line: state.line + key, historyIndex: null });
      return { state, accepted: false };
  }
}

/** Types a whole command and presses Enter: convenient for tests and for checking solutions. */
export function typeCommand(state: ShellState, command: string): ShellState {
  let current = state;
  for (const char of command) current = dispatchShellKey(current, { key: char }).state;
  return dispatchShellKey(current, { key: "Enter" }).state;
}
