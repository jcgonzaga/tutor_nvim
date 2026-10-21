import type { Exercise } from "@tutor-nvim/exercise-schema";
import type { Attempt } from "./attempt";
import { evaluateGoal } from "./goal";
import {
  computeMetrics,
  DEFAULT_METRICS_CONFIG,
  type AttemptMetrics,
  type MetricsConfig,
} from "./metrics";
import { classifyStrategy, type StrategyClassification } from "./strategy";

/**
 * Two independent answers: did the learner solve it (`success`), and how
 * (`strategy`). A solved task can still have a poor strategy.
 */
export interface AttemptEvaluation {
  readonly success: boolean;
  readonly strategy: StrategyClassification;
  readonly metrics: AttemptMetrics;
}

export function evaluateAttempt(
  exercise: Exercise,
  attempt: Attempt,
  config: MetricsConfig = DEFAULT_METRICS_CONFIG,
): AttemptEvaluation {
  const success = evaluateGoal(exercise, attempt.state).met;
  const strategy = classifyStrategy(exercise, attempt, success);
  return {
    success,
    strategy,
    metrics: computeMetrics(exercise, attempt, success, strategy, config),
  };
}
