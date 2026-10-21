import type { Exercise } from "@tutor-nvim/exercise-schema";
import type { Attempt } from "./attempt";
import type { AttemptEvaluation } from "./evaluate";

/**
 * How an attempt reads to the learner (T-514, PRD 39):
 * - `perfect`: solved with the optimal strategy, no errors and no hints;
 * - `completed`: solved, but there was a better way (or help was used);
 * - `failed`: not solved (the learner gave up).
 */
export type FeedbackKind = "perfect" | "completed" | "failed";

export interface Feedback {
  readonly kind: FeedbackKind;
  /** What the learner typed, in key notation (`ci"production<Esc>`). */
  readonly yourKeys: string;
  /**
   * The shortest declared optimal solution, to show "a better option". `null` for a perfect run,
   * or when the learner's keystrokes already matched it.
   */
  readonly betterKeys: string | null;
  readonly hintsUsed: number;
}

export function describeFeedback(
  exercise: Exercise,
  attempt: Attempt,
  evaluation: AttemptEvaluation,
): Feedback {
  const { metrics } = evaluation;
  const yourKeys = attempt.events.map((event) => event.logicalKey).join("");

  const perfect =
    evaluation.success &&
    evaluation.strategy === "optimal" &&
    metrics.errors === 0 &&
    metrics.hintsUsed === 0;
  const kind: FeedbackKind = perfect ? "perfect" : evaluation.success ? "completed" : "failed";

  const optimal = exercise.solutions
    .filter((solution) => solution.classification === "optimal")
    .sort((a, b) => a.keys.length - b.keys.length)[0];
  const betterKeys =
    optimal && kind !== "perfect" && optimal.keys.join("") !== yourKeys
      ? optimal.keys.join("")
      : null;

  return { kind, yourKeys, betterKeys, hintsUsed: metrics.hintsUsed };
}
