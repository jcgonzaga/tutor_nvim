import type {
  ContentBundle,
  Exercise,
  WorkspaceExercise,
  WorkspaceSolution,
  WorkspaceSolutionAction,
} from "@tutor-nvim/exercise-schema";
import { startAttempt } from "./attempt";
import { detectAntiPatterns } from "./antipatterns";
import { evaluateAttempt } from "./evaluate";
import { goalMet } from "./goal";
import { simulateSolution } from "./simulate";
import { evaluateWorkspaceGoal } from "./workspace-goal";
import { simulateWorkspaceSolution } from "./workspace-replay";

/**
 * Executes an exercise's declared solutions against the engine (CI requirement,
 * AGENTS.md 10) and reports every way the content contradicts itself. Each kind is replayed by the
 * engine that owns it: keys for the simulators, actions through the workspace engine.
 */
export function checkExercise(exercise: Exercise): string[] {
  if (exercise.kind === "workspace") return checkWorkspaceExercise(exercise);
  const where = exercise.slug;
  const errors: string[] = [];

  // A goal that already holds before the learner does anything teaches nothing.
  if (goalMet(exercise, startAttempt(exercise, 0))) {
    errors.push(`${where}: the objective is already satisfied by the initial state`);
  }

  for (const solution of exercise.solutions) {
    const label = `${where}: solution ${solution.sequence}`;
    const attempt = simulateSolution(exercise, solution);
    const evaluation = evaluateAttempt(exercise, attempt);

    if (!evaluation.success) {
      errors.push(`${label} does not reach the objective`);
      continue;
    }
    if (attempt.events.length < solution.keys.length) {
      const extra = solution.keys.length - attempt.events.length;
      errors.push(
        `${label} has ${extra} key${extra === 1 ? "" : "s"} after the objective is already reached`,
      );
    }
    if (evaluation.strategy !== solution.classification) {
      errors.push(
        `${label} is declared ${solution.classification} but evaluates as ${evaluation.strategy}`,
      );
    }
    // A solution blessed as good must not be one the exercise itself warns against.
    if (solution.classification === "optimal" || solution.classification === "efficient") {
      const hits = detectAntiPatterns(exercise, attempt).map((hit) => hit.id);
      if (hits.length > 0)
        errors.push(
          `${label} is declared ${solution.classification} but triggers ${hits.join(", ")}`,
        );
    }
  }
  return errors;
}

/** How an action reads in a message: `window.zoom`, or `edit.delete (inner-word)`. */
const actionText = (action: WorkspaceSolutionAction): string =>
  action.target === undefined ? action.action : `${action.action} (${action.target})`;

/** A solution as a message names it: its position and its actions, since it has no key sequence. */
const solutionText = (solution: WorkspaceSolution): string =>
  solution.actions.length === 0 ? "no actions" : solution.actions.map(actionText).join(", ");

/**
 * The workspace half of the gate: replay every declared solution and judge the end state.
 *
 * The three ways such content can be wrong are all content bugs, and each message says which one it
 * is: the objective already holds before anything happens, an action the engine cannot apply, or an
 * end state that misses a goal (the failing goal is named with what it expected and what it found).
 */
function checkWorkspaceExercise(exercise: WorkspaceExercise): string[] {
  const where = exercise.slug;
  const errors: string[] = [];

  if (goalMet(exercise, startAttempt(exercise, 0))) {
    errors.push(`${where}: the objective is already satisfied by the initial state`);
  }

  for (const [index, solution] of exercise.solutions.entries()) {
    const label = `${where}: solution ${index + 1} (${solutionText(solution)})`;
    const replay = simulateWorkspaceSolution(exercise, solution);

    if (replay.refused !== null) {
      errors.push(`${label} is refused by the workspace: ${replay.refused.reason}`);
      continue;
    }

    const goal = evaluateWorkspaceGoal(exercise, replay.state);
    if (!goal.met) {
      errors.push(`${label} does not reach the objective: ${goal.objective.failures.join("; ")}`);
      continue;
    }

    const strategy = evaluateAttempt(exercise, replay).strategy;
    if (strategy !== solution.classification) {
      errors.push(`${label} is declared ${solution.classification} but evaluates as ${strategy}`);
    }
  }
  return errors;
}

export function checkContent(bundle: ContentBundle): string[] {
  return bundle.exercises.flatMap(checkExercise);
}
