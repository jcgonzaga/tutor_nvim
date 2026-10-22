import type { AntiPatternId, ShellAntiPatternId } from "@tutor-nvim/exercise-schema";
import type { AttemptEvaluation } from "./evaluate";

/**
 * When to explain (ADR-0005). The explanation arrives after the attempt, never during it, and only
 * when it is likely to help: the exercise was not solved, or it was solved so badly (or so far from
 * the best route) that the performance score is at or below this threshold. A threshold, not a UI
 * constant, so it can be tuned with the rest of the evaluation configuration (AGENTS 14).
 */
export interface ExplanationConfig {
  /** Explain when the performance score (0-100) is at or below this value. */
  readonly maxScore: number;
}

export const DEFAULT_EXPLANATION_CONFIG: ExplanationConfig = { maxScore: 50 };

export type ExplanationReason = "unsolved" | "low-score";

export interface ExplanationPlan {
  /** Why an explanation is due; `null` when the attempt did not need one. */
  readonly reason: ExplanationReason | null;
  /** The habits detected in this attempt (each once), to explain next to the "why". */
  readonly antiPatterns: readonly (AntiPatternId | ShellAntiPatternId)[];
}

const NONE: ExplanationPlan = { reason: null, antiPatterns: [] };

export function planExplanation(
  evaluation: Pick<AttemptEvaluation, "success" | "antiPatterns"> & {
    readonly metrics: Pick<AttemptEvaluation["metrics"], "performanceScore">;
  },
  config: ExplanationConfig = DEFAULT_EXPLANATION_CONFIG,
): ExplanationPlan {
  const reason: ExplanationReason | null = !evaluation.success
    ? "unsolved"
    : evaluation.metrics.performanceScore <= config.maxScore
      ? "low-score"
      : null;
  if (reason === null) return NONE;
  return { reason, antiPatterns: [...new Set(evaluation.antiPatterns.map((hit) => hit.id))] };
}
