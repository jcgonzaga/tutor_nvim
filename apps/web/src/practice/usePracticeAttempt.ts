import { useCallback, useMemo, useReducer } from "react";
import {
  advanceAttempt,
  evaluateAttempt,
  startAttempt,
  type Attempt,
  type AttemptEvaluation,
  type TimedKeyInput,
} from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";

interface PracticeState {
  readonly exercise: Exercise;
  readonly attempt: Attempt;
}

type PracticeAction =
  | { readonly type: "input"; readonly input: TimedKeyInput }
  | { readonly type: "reset"; readonly at: number };

function reducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case "input":
      return { ...state, attempt: advanceAttempt(state.exercise, state.attempt, action.input) };
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

  const sendInput = useCallback((input: TimedKeyInput) => dispatch({ type: "input", input }), []);
  const reset = useCallback(() => dispatch({ type: "reset", at: performance.now() }), []);

  return { attempt, evaluation, sendInput, reset };
}
