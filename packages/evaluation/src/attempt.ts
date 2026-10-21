import {
  createVimState,
  dispatch,
  formatKey,
  keyInputFromToken,
  runKeys,
  type KeyInput,
  type Position,
  type VimMode,
  type VimState,
} from "@tutor-nvim/vim-engine";
import { dispatchShellKey, initShell, type ShellState } from "@tutor-nvim/shell-engine";
import type { Exercise, ShellExercise, VimExercise } from "@tutor-nvim/exercise-schema";
import { goalMet } from "./goal";
import type { HintReveal } from "./hints";

/** Input stamped by the adapter (`performance.now()`), in milliseconds. */
export interface TimedKeyInput extends KeyInput {
  readonly timestamp: number;
}

/**
 * One logical input, enough to replay the attempt by feeding `key`/modifiers to
 * the engine again. Kept local during the attempt; never sent per keypress.
 */
export interface InputEvent {
  readonly sequence: number;
  readonly timestamp: number;
  readonly key: string;
  /** Physical key (`KeyboardEvent.code`); `null` for synthetic input such as solution runs. */
  readonly code: string | null;
  /** Canonical notation (`<Esc>`), the unit strategy matching compares. */
  readonly logicalKey: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
  /** Mode the engine was in when the input arrived (`shell` for the terminal). */
  readonly mode: VimMode | "shell";
  /** In the shell the caret sits on line 0 at the end of what has been typed. */
  readonly cursorBefore: Position;
  readonly cursorAfter: Position;
  readonly accepted: boolean;
}

interface AttemptBase {
  readonly startedAt: number;
  readonly events: readonly InputEvent[];
  /** Timestamp of the input that satisfied the goal; `null` while in progress. */
  readonly completedAt: number | null;
  /** Hints the learner asked for, in order. */
  readonly hints: readonly HintReveal[];
}

export interface VimAttempt extends AttemptBase {
  readonly kind: "vim";
  readonly initialState: VimState;
  readonly state: VimState;
}

export interface ShellAttempt extends AttemptBase {
  readonly kind: "shell";
  readonly initialState: ShellState;
  readonly state: ShellState;
}

/** An attempt in either simulator; `kind` tells which, and always matches its exercise's. */
export type Attempt = VimAttempt | ShellAttempt;

export function startAttempt(exercise: VimExercise, startedAt: number): VimAttempt;
export function startAttempt(exercise: ShellExercise, startedAt: number): ShellAttempt;
export function startAttempt(exercise: Exercise, startedAt: number): Attempt;
export function startAttempt(exercise: Exercise, startedAt: number): Attempt {
  if (exercise.kind === "shell") {
    const { files, modes, cwd } = exercise.initialState;
    const initialState = initShell({
      files: Object.fromEntries(
        Object.entries(files).map(([path, content]) => {
          const mode = modes[path];
          return [path, mode === undefined ? content : { content, mode }];
        }),
      ),
      cwd: cwd === "" ? "." : cwd,
    });
    return {
      kind: "shell",
      startedAt,
      initialState,
      state: initialState,
      events: [],
      completedAt: null,
      hints: [],
    };
  }
  const initialState = runKeys(
    createVimState({
      lines: exercise.initialState.lines,
      cursor: exercise.initialState.cursor,
      mode: exercise.initialState.vimMode,
    }),
    exercise.initialState.setupKeys.map(keyInputFromToken),
  );
  return {
    kind: "vim",
    startedAt,
    initialState,
    state: initialState,
    events: [],
    completedAt: null,
    hints: [],
  };
}

/** Telemetry only: runs the engine and appends the event. Knows nothing about goals. */
export function recordInput<A extends Attempt>(attempt: A, input: TimedKeyInput): A {
  if (attempt.kind === "shell") {
    const { state, accepted } = dispatchShellKey(attempt.state, input);
    const event: InputEvent = {
      ...baseEvent(attempt, input, accepted),
      mode: "shell",
      cursorBefore: { line: 0, column: attempt.state.line.length },
      cursorAfter: { line: 0, column: state.line.length },
    };
    return { ...attempt, state, events: [...attempt.events, event] } as A;
  }
  const { state, accepted } = dispatch(attempt.state, input);
  const event: InputEvent = {
    ...baseEvent(attempt, input, accepted),
    mode: attempt.state.mode,
    cursorBefore: attempt.state.cursor,
    cursorAfter: state.cursor,
  };
  return { ...attempt, state, events: [...attempt.events, event] } as A;
}

function baseEvent(
  attempt: Attempt,
  input: TimedKeyInput,
  accepted: boolean,
): Omit<InputEvent, "mode" | "cursorBefore" | "cursorAfter"> {
  return {
    sequence: attempt.events.length,
    timestamp: input.timestamp,
    key: input.key,
    code: input.code ?? null,
    logicalKey: formatKey(input),
    ctrl: input.ctrl === true,
    alt: input.alt === true,
    shift: input.shift === true,
    meta: input.meta === true,
    accepted,
  };
}

/**
 * Records an input and marks the attempt complete the first time the goal is
 * met. Completed attempts are frozen: later input is ignored.
 */
export function advanceAttempt<A extends Attempt>(
  exercise: Exercise,
  attempt: A,
  input: TimedKeyInput,
): A {
  if (attempt.completedAt !== null) return attempt;
  const next = recordInput(attempt, input);
  return goalMet(exercise, next) ? { ...next, completedAt: input.timestamp } : next;
}

/**
 * Ends an attempt the learner did not solve (they chose to move on). The attempt is frozen like a
 * solved one, and evaluating it reports `success: false`, so giving up is an honest failed attempt
 * rather than a missing one. Calling it on an attempt that already ended changes nothing.
 */
export function giveUpAttempt<A extends Attempt>(attempt: A, at: number): A {
  return attempt.completedAt === null ? { ...attempt, completedAt: at } : attempt;
}
