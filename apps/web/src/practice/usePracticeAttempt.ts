import { useCallback, useMemo, useReducer } from "react";
import {
  advanceAttempt,
  evaluateAttempt,
  giveUpAttempt,
  hintStatus,
  revealHint,
  startAttempt,
  type Attempt,
  type AttemptEvaluation,
  type HintStatus,
  type TimedKeyInput,
} from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";

interface PracticeState {
  readonly exercise: Exercise;
  readonly attempt: Attempt;
}

type PracticeAction =
  | { readonly type: "input"; readonly input: TimedKeyInput }
  | { readonly type: "hint"; readonly at: number }
  | { readonly type: "giveUp"; readonly at: number }
  | { readonly type: "reset"; readonly at: number };

function reducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case "input":
      return { ...state, attempt: advanceAttempt(state.exercise, state.attempt, action.input) };
    case "hint":
      return { ...state, attempt: revealHint(state.exercise, state.attempt, action.at) };
    case "giveUp":
      return { ...state, attempt: giveUpAttempt(state.attempt, action.at) };
    case "reset":
      return { ...state, attempt: startAttempt(state.exercise, action.at) };
  }
}

/** Thin React binding: all attempt logic lives in `@tutor-nvim/evaluation`. */
export function usePracticeAttempt(exercise: Exercise) {
  const [{ attempt }, dispatch] = useReducer(reducer, exercise, (initial) => ({
    exercise: initial,
    attempt: startAttempt(initial, performance.now()),
  }));

  const evaluation: AttemptEvaluation | null = useMemo(
    () => (attempt.completedAt === null ? null : evaluateAttempt(exercise, attempt)),
    [attempt, exercise],
  );
  const hints: HintStatus = useMemo(() => hintStatus(exercise, attempt), [exercise, attempt]);

  const sendInput = useCallback((input: TimedKeyInput) => dispatch({ type: "input", input }), []);
  const requestHint = useCallback(() => dispatch({ type: "hint", at: performance.now() }), []);
  const giveUp = useCallback(() => dispatch({ type: "giveUp", at: performance.now() }), []);
  const reset = useCallback(() => dispatch({ type: "reset", at: performance.now() }), []);

  return { attempt, evaluation, hints, sendInput, requestHint, giveUp, reset };
}
