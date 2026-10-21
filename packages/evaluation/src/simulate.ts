import { keyInputFromToken } from "@tutor-nvim/vim-engine";
import type {
  Exercise,
  ExerciseSolution,
  ShellExercise,
  ShellSolution,
  VimExercise,
} from "@tutor-nvim/exercise-schema";
import {
  advanceAttempt,
  startAttempt,
  type Attempt,
  type ShellAttempt,
  type VimAttempt,
} from "./attempt";

/**
 * Plays a declared solution through the engine with deterministic timestamps
 * (`stepMs` apart). Used by tests and content validation: a solution that
 * cannot reach the goal is a content bug.
 */
export function simulateSolution(
  exercise: VimExercise,
  solution: ExerciseSolution,
  options?: { startedAt?: number; stepMs?: number },
): VimAttempt;
export function simulateSolution(
  exercise: ShellExercise,
  solution: ShellSolution,
  options?: { startedAt?: number; stepMs?: number },
): ShellAttempt;
export function simulateSolution(
  exercise: Exercise,
  solution: ExerciseSolution | ShellSolution,
  options?: { startedAt?: number; stepMs?: number },
): Attempt;
export function simulateSolution(
  exercise: Exercise,
  solution: ExerciseSolution | ShellSolution,
  { startedAt = 0, stepMs = 100 }: { startedAt?: number; stepMs?: number } = {},
): Attempt {
  return solution.keys.reduce<Attempt>(
    (attempt, token, index) =>
      advanceAttempt(exercise, attempt, {
        ...keyInputFromToken(token),
        timestamp: startedAt + (index + 1) * stepMs,
      }),
    startAttempt(exercise, startedAt),
  );
}
