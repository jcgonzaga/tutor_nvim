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
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { evaluateGoal } from "./goal";
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
  /** Mode the engine was in when the input arrived. */
  readonly mode: VimMode;
  readonly cursorBefore: Position;
  readonly cursorAfter: Position;
  readonly accepted: boolean;
}

export interface Attempt {
  readonly startedAt: number;
  readonly initialState: VimState;
  readonly state: VimState;
  readonly events: readonly InputEvent[];
  /** Timestamp of the input that satisfied the goal; `null` while in progress. */
  readonly completedAt: number | null;
  /** Hints the learner asked for, in order. */
  readonly hints: readonly HintReveal[];
}

export function startAttempt(exercise: Exercise, startedAt: number): Attempt {
  const initialState = runKeys(
    createVimState({
      lines: exercise.initialState.lines,
      cursor: exercise.initialState.cursor,
      mode: exercise.initialState.vimMode,
    }),
    exercise.initialState.setupKeys.map(keyInputFromToken),
  );
  return { startedAt, initialState, state: initialState, events: [], completedAt: null, hints: [] };
}

/** Telemetry only: runs the engine and appends the event. Knows nothing about goals. */
export function recordInput(attempt: Attempt, input: TimedKeyInput): Attempt {
  const { state, accepted } = dispatch(attempt.state, input);
  const event: InputEvent = {
    sequence: attempt.events.length,
    timestamp: input.timestamp,
    key: input.key,
    code: input.code ?? null,
    logicalKey: formatKey(input),
    ctrl: input.ctrl === true,
    alt: input.alt === true,
    shift: input.shift === true,
    meta: input.meta === true,
    mode: attempt.state.mode,
    cursorBefore: attempt.state.cursor,
    cursorAfter: state.cursor,
    accepted,
  };
  return { ...attempt, state, events: [...attempt.events, event] };
}

/**
 * Records an input and marks the attempt complete the first time the goal is
 * met. Completed attempts are frozen: later input is ignored.
 */
export function advanceAttempt(
  exercise: Exercise,
  attempt: Attempt,
  input: TimedKeyInput,
): Attempt {
  if (attempt.completedAt !== null) return attempt;
  const next = recordInput(attempt, input);
  return evaluateGoal(exercise, next.state).met ? { ...next, completedAt: input.timestamp } : next;
}

/**
 * Ends an attempt the learner did not solve (they chose to move on). The attempt is frozen like a
 * solved one, and evaluating it reports `success: false`, so giving up is an honest failed attempt
 * rather than a missing one. Calling it on an attempt that already ended changes nothing.
 */
export function giveUpAttempt(attempt: Attempt, at: number): Attempt {
  return attempt.completedAt === null ? { ...attempt, completedAt: at } : attempt;
}
