import { createVimState, dispatch, runKeys } from "./engine";
import { parseKeySequence } from "./keys";
import type { Position, VimState } from "./types";

/** Starts a NORMAL-mode session on `text` (lines joined by `\n`) at `[line, column]`. */
export function start(text: string, cursor: [number, number] = [0, 0]): VimState {
  return createVimState({
    lines: text.split("\n"),
    cursor: { line: cursor[0], column: cursor[1] },
  });
}

export function press(state: VimState, sequence: string): VimState {
  return runKeys(state, parseKeySequence(sequence));
}

/** Runs keys and returns what matters for assertions. */
export function run(text: string, cursor: [number, number], keys: string) {
  const state = press(start(text, cursor), keys);
  return {
    text: state.buffer.lines.join("\n"),
    cursor: [state.cursor.line, state.cursor.column] as [number, number],
    mode: state.mode,
    register: state.register,
  };
}

export function accepted(state: VimState, sequence: string): boolean[] {
  const results: boolean[] = [];
  let current = state;
  for (const key of parseKeySequence(sequence)) {
    const result = dispatch(current, key);
    results.push(result.accepted);
    current = result.state;
  }
  return results;
}

export const at = (line: number, column: number): Position => ({ line, column });
