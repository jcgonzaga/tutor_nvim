import type { Objective, Exercise } from "@tutor-nvim/exercise-schema";
import type { VimState } from "@tutor-nvim/vim-engine";

export interface GoalEvaluation {
  readonly met: boolean;
  /** Per-check detail for the objective (compound goals list every sub-goal). */
  readonly objective: ObjectiveEvaluation;
  /** `null` when the exercise does not constrain the final mode. */
  readonly modeMatches: boolean | null;
}

export type ObjectiveEvaluation =
  | { readonly type: "buffer_equals" | "cursor_at" | "mode_equals"; readonly met: boolean }
  | { readonly type: "all"; readonly met: boolean; readonly goals: readonly ObjectiveEvaluation[] };

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

export function evaluateObjective(objective: Objective, state: VimState): ObjectiveEvaluation {
  switch (objective.type) {
    case "buffer_equals":
      return { type: objective.type, met: sameLines(state.buffer.lines, objective.targetLines) };
    case "cursor_at":
      return {
        type: objective.type,
        met:
          state.cursor.line === objective.position.line &&
          state.cursor.column === objective.position.column,
      };
    case "mode_equals":
      return { type: objective.type, met: state.mode === objective.mode };
    case "all": {
      const goals = objective.goals.map((goal) => evaluateObjective(goal, state));
      return { type: "all", met: goals.every((goal) => goal.met), goals };
    }
  }
}

/**
 * Deterministic goal check: is the state a valid end state for the exercise?
 * Says nothing about *how* the learner got there (see `classifyStrategy`).
 */
export function evaluateGoal(exercise: Exercise, state: VimState): GoalEvaluation {
  const objective = evaluateObjective(exercise.objective, state);
  const modeMatches = exercise.evaluation.requireFinalNormalMode ? state.mode === "normal" : null;
  return { met: objective.met && modeMatches !== false, objective, modeMatches };
}
