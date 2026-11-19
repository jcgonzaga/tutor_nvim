import { keyInputFromToken } from "@tutor-nvim/vim-engine";
import type {
  Exercise,
  ExerciseSolution,
  ShellExercise,
  ShellSolution,
  VimExercise,
  WorkspaceExercise,
  WorkspaceSolution,
} from "@tutor-nvim/exercise-schema";
import {
  advanceAttempt,
  startAttempt,
  type Attempt,
  type ShellAttempt,
  type VimAttempt,
} from "./attempt";
import { simulateWorkspaceSolution, type WorkspaceReplay } from "./workspace-replay";

/**
 * Plays a declared solution with deterministic timestamps (`stepMs` apart): keys through the
 * simulator, actions through the workspace engine. Used by tests and content validation: a solution
 * that cannot reach the goal is a content bug.
 *
 * The kind and the solution must agree. A Vim exercise with an action list (or the other way round)
 * is a programming error, so it throws instead of replaying nothing and reporting success.
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
  exercise: WorkspaceExercise,
  solution: WorkspaceSolution,
  options?: { startedAt?: number; stepMs?: number },
): WorkspaceReplay;
export function simulateSolution(
  exercise: Exercise,
  solution: ExerciseSolution | ShellSolution | WorkspaceSolution,
  options?: { startedAt?: number; stepMs?: number },
): Attempt;
export function simulateSolution(
  exercise: Exercise,
  solution: ExerciseSolution | ShellSolution | WorkspaceSolution,
  { startedAt = 0, stepMs = 100 }: { startedAt?: number; stepMs?: number } = {},
): Attempt {
  if (exercise.kind === "workspace") {
    if (!("actions" in solution)) {
      throw new Error(
        `a workspace exercise is solved by actions, not by the keys of "${exercise.slug}"`,
      );
    }
    return simulateWorkspaceSolution(exercise, solution, { startedAt, stepMs });
  }
  if (!("keys" in solution)) {
    throw new Error(
      `a ${exercise.kind} exercise is solved by keys, not by the actions of "${exercise.slug}"`,
    );
  }
  return solution.keys.reduce<Attempt>(
    (attempt, token, index) =>
      advanceAttempt(exercise, attempt, {
        ...keyInputFromToken(token),
        timestamp: startedAt + (index + 1) * stepMs,
      }),
    startAttempt(exercise, startedAt),
  );
}
