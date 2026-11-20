import { useCallback, useMemo, useReducer } from "react";
import {
  advanceAttempt,
  advanceWorkspaceAttempt,
  advanceWorkspaceKey,
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
import type { Exercise, KeymapAction } from "@tutor-nvim/exercise-schema";
import type { WorkspaceActionOptions } from "./workspaceEngine";

/** Why the last workspace key or action was refused, in the words of the engine that refused it. */
export interface WorkspaceRefusal {
  /** `null` when the workspace refused the key without a reason of its own (an unhandled key). */
  readonly reason: string | null;
}

interface PracticeState {
  readonly exercise: Exercise;
  readonly attempt: Attempt;
  /** The last refusal of a workspace key or action; `null` when the last one was taken. */
  readonly refusal: WorkspaceRefusal | null;
}

type PracticeAction =
  | { readonly type: "input"; readonly input: TimedKeyInput }
  | {
      readonly type: "workspaceKey";
      readonly input: TimedKeyInput;
    }
  | {
      readonly type: "workspaceAction";
      readonly action: KeymapAction;
      readonly options: WorkspaceActionOptions;
      readonly at: number;
    }
  | { readonly type: "hint"; readonly at: number }
  | { readonly type: "giveUp"; readonly at: number }
  | { readonly type: "reset"; readonly at: number };

/**
 * The reducer is the whole state machine of an attempt, and every rule it applies lives in
 * `@tutor-nvim/evaluation`: the keys of a vim or shell attempt through `advanceAttempt`, the actions
 * and the unclaimed keys of a workspace attempt through their own goal-aware siblings (T8). Completed
 * attempts are frozen, which is why the workspace cases check `completedAt` before touching anything.
 */
function reducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case "input":
      return {
        ...state,
        attempt: advanceAttempt(state.exercise, state.attempt, action.input),
      };
    case "workspaceKey": {
      if (state.attempt.kind !== "workspace" || state.attempt.completedAt !== null) return state;
      const recorded = advanceWorkspaceKey(state.exercise, state.attempt, action.input);
      return {
        exercise: state.exercise,
        attempt: recorded.attempt,
        refusal: recorded.accepted ? null : { reason: recorded.reason ?? null },
      };
    }
    case "workspaceAction": {
      if (state.attempt.kind !== "workspace" || state.attempt.completedAt !== null) return state;
      const recorded = advanceWorkspaceAttempt(
        state.exercise,
        state.attempt,
        action.action,
        action.options,
        action.at,
      );
      return {
        exercise: state.exercise,
        attempt: recorded.attempt,
        refusal: recorded.applied ? null : { reason: recorded.reason ?? null },
      };
    }
    case "hint":
      return { ...state, attempt: revealHint(state.exercise, state.attempt, action.at) };
    case "giveUp":
      return { ...state, attempt: giveUpAttempt(state.attempt, action.at) };
    case "reset":
      return {
        exercise: state.exercise,
        attempt: startAttempt(state.exercise, action.at),
        refusal: null,
      };
  }
}

/** Thin React binding: all attempt logic lives in `@tutor-nvim/evaluation`. */
export function usePracticeAttempt(exercise: Exercise) {
  const [{ attempt, refusal }, dispatch] = useReducer(reducer, exercise, (initial) => ({
    exercise: initial,
    attempt: startAttempt(initial, performance.now()),
    refusal: null,
  }));

  const evaluation: AttemptEvaluation | null = useMemo(
    () => (attempt.completedAt === null ? null : evaluateAttempt(exercise, attempt)),
    [attempt, exercise],
  );
  const hints: HintStatus = useMemo(() => hintStatus(exercise, attempt), [exercise, attempt]);

  const sendInput = useCallback((input: TimedKeyInput) => dispatch({ type: "input", input }), []);
  const sendWorkspaceKey = useCallback(
    (input: TimedKeyInput) => dispatch({ type: "workspaceKey", input }),
    [],
  );
  const sendWorkspaceAction = useCallback(
    (action: KeymapAction, options: WorkspaceActionOptions = {}) =>
      dispatch({ type: "workspaceAction", action, options, at: performance.now() }),
    [],
  );
  const requestHint = useCallback(() => dispatch({ type: "hint", at: performance.now() }), []);
  const giveUp = useCallback(() => dispatch({ type: "giveUp", at: performance.now() }), []);
  const reset = useCallback(() => dispatch({ type: "reset", at: performance.now() }), []);

  return {
    attempt,
    evaluation,
    hints,
    refusal,
    sendInput,
    sendWorkspaceKey,
    sendWorkspaceAction,
    requestHint,
    giveUp,
    reset,
  };
}
