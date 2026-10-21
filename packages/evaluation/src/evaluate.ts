import type { Exercise } from "@tutor-nvim/exercise-schema";
import type { Attempt } from "./attempt";
import {
  DEFAULT_ANTI_PATTERN_CONFIG,
  detectAntiPatterns,
  optimalKeystrokes,
  type AntiPatternConfig,
  type AntiPatternHit,
} from "./antipatterns";
import { evaluateGoal } from "./goal";
import {
  computeMetrics,
  DEFAULT_METRICS_CONFIG,
  type AttemptMetrics,
  type MetricsConfig,
} from "./metrics";
import {
  classifyStrategy,
  DEFAULT_STRATEGY_CONFIG,
  type StrategyClassification,
  type StrategyConfig,
} from "./strategy";

/** Every tunable of evaluation in one place. */
export interface EvaluationConfig {
  readonly metrics: MetricsConfig;
  readonly strategy: StrategyConfig;
  readonly antiPatterns: AntiPatternConfig;
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  metrics: DEFAULT_METRICS_CONFIG,
  strategy: DEFAULT_STRATEGY_CONFIG,
  antiPatterns: DEFAULT_ANTI_PATTERN_CONFIG,
};

/**
 * Two independent answers: did the learner solve it (`success`), and how
 * (`strategy`). A solved task can still have a poor strategy.
 */
export interface AttemptEvaluation {
  readonly success: boolean;
  readonly strategy: StrategyClassification;
  readonly antiPatterns: readonly AntiPatternHit[];
  readonly metrics: AttemptMetrics;
}

export function evaluateAttempt(
  exercise: Exercise,
  attempt: Attempt,
  config: EvaluationConfig = DEFAULT_EVALUATION_CONFIG,
): AttemptEvaluation {
  const success = evaluateGoal(exercise, attempt.state).met;
  const antiPatterns = detectAntiPatterns(exercise, attempt, config.antiPatterns);
  const strategy = classifyStrategy({
    exercise,
    attempt,
    success,
    antiPatterns,
    optimalKeystrokes: optimalKeystrokes(exercise),
    config: config.strategy,
  });
  return {
    success,
    strategy,
    antiPatterns,
    metrics: computeMetrics(exercise, attempt, success, strategy, config.metrics),
  };
}
