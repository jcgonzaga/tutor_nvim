import type { Exercise, SolutionClassification } from "@tutor-nvim/exercise-schema";
import type { Attempt } from "./attempt";

export type StrategyClassification = SolutionClassification | "failed";

/**
 * Basic matching: a successful attempt whose key sequence equals a declared
 * solution takes that solution's classification; any other success is `valid`.
 * Rule-based refinement (inefficient, anti-patterns) is added with M3.
 */
export function classifyStrategy(
  exercise: Exercise,
  attempt: Attempt,
  success: boolean,
): StrategyClassification {
  if (!success) return "failed";

  const typed = attempt.events.map((event) => event.logicalKey);
  const match = exercise.solutions.find(
    (solution) =>
      solution.keys.length === typed.length &&
      solution.keys.every((key, index) => key === typed[index]),
  );
  return match?.classification ?? "valid";
}
