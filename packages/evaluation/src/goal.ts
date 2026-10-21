import { type VimState } from "@tutor-nvim/vim-engine";
import type { Exercise } from "@tutor-nvim/exercise-schema";

export interface GoalEvaluation {
  readonly met: boolean;
  readonly bufferMatches: boolean;
  /** `null` when the exercise does not constrain the final mode. */
  readonly modeMatches: boolean | null;
}

/**
 * Deterministic goal check: is the state a valid end state for the exercise?
 * Says nothing about *how* the learner got there (see `classifyStrategy`).
 */
export function evaluateGoal(exercise: Exercise, state: VimState): GoalEvaluation {
  const { objective, evaluation } = exercise;

  let bufferMatches: boolean;
  switch (objective.type) {
    case "buffer_equals":
      bufferMatches = sameLines(state.buffer.lines, objective.targetLines);
      break;
  }

  const modeMatches = evaluation.requireFinalNormalMode ? state.mode === "normal" : null;
  return { met: bufferMatches && modeMatches !== false, bufferMatches, modeMatches };
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index]);
}
