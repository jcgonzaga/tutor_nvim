import type { ContentBundle, Exercise } from "@tutor-nvim/exercise-schema";
import { startAttempt } from "./attempt";
import { detectAntiPatterns } from "./antipatterns";
import { evaluateAttempt } from "./evaluate";
import { goalMet } from "./goal";
import { simulateSolution } from "./simulate";

/**
 * Executes an exercise's declared solutions against the engine (CI requirement,
 * AGENTS.md 10) and reports every way the content contradicts itself.
 */
export function checkExercise(exercise: Exercise): string[] {
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

export function checkContent(bundle: ContentBundle): string[] {
  return bundle.exercises.flatMap(checkExercise);
}
