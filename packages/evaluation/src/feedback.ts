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
  /**
   * What the learner did: what they typed, in key notation (`ci"production<Esc>`), or the actions a
   * workspace attempt spent, since that attempt has no keys (`window.split-side-by-side`).
   */
  readonly yourKeys: string;
  /**
   * The shortest declared optimal solution, to show "a better option", in the same unit. `null` for a
   * perfect run, or when the learner's run already matched it.
   */
  readonly betterKeys: string | null;
  readonly hintsUsed: number;
}

/** One action as the learner reads it: `window.zoom`, or `edit.delete (inner-word)`. */
const actionText = (action: { readonly action: string; readonly target?: string }): string =>
  action.target === undefined ? action.action : `${action.action} (${action.target})`;

/** A solution in the unit it was declared in: keys for the simulators, actions for the workspace. */
const runOfSolution = (solution: Exercise["solutions"][number]): string =>
  "keys" in solution ? solution.keys.join("") : solution.actions.map(actionText).join(" ");

/** What a solution costs in its own unit, so "the shortest one" means the same thing per kind. */
const costOfSolution = (solution: Exercise["solutions"][number]): number =>
  "keys" in solution ? solution.keys.length : solution.actions.length;

export function describeFeedback(
  exercise: Exercise,
  attempt: Attempt,
  evaluation: AttemptEvaluation,
): Feedback {
  const { metrics } = evaluation;
  const yourKeys =
    attempt.kind === "workspace"
      ? attempt.actions.map(actionText).join(" ")
      : attempt.events.map((event) => event.logicalKey).join("");

  const perfect =
    evaluation.success &&
    evaluation.strategy === "optimal" &&
    metrics.errors === 0 &&
    metrics.hintsUsed === 0;
  const kind: FeedbackKind = perfect ? "perfect" : evaluation.success ? "completed" : "failed";

  const optimal = exercise.solutions
    .filter((solution) => solution.classification === "optimal")
    .sort((a, b) => costOfSolution(a) - costOfSolution(b))[0];
  const betterKeys =
    optimal && kind !== "perfect" && runOfSolution(optimal) !== yourKeys
      ? runOfSolution(optimal)
      : null;

  return { kind, yourKeys, betterKeys, hintsUsed: metrics.hintsUsed };
}
