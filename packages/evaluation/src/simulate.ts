import { keyInputFromToken } from "@tutor-nvim/vim-engine";
import type { Exercise, ExerciseSolution } from "@tutor-nvim/exercise-schema";
import { advanceAttempt, startAttempt, type Attempt } from "./attempt";

/**
 * Plays a declared solution through the engine with deterministic timestamps
 * (`stepMs` apart). Used by tests and content validation: a solution that
 * cannot reach the goal is a content bug.
 */
export function simulateSolution(
  exercise: Exercise,
  solution: ExerciseSolution,
  { startedAt = 0, stepMs = 100 }: { startedAt?: number; stepMs?: number } = {},
): Attempt {
  return solution.keys.reduce(
    (attempt, token, index) =>
      advanceAttempt(exercise, attempt, {
        ...keyInputFromToken(token),
        timestamp: startedAt + (index + 1) * stepMs,
      }),
    startAttempt(exercise, startedAt),
  );
}
