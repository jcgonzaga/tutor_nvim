export {
  advanceAttempt,
  giveUpAttempt,
  recordInput,
  startAttempt,
  type Attempt,
  type InputEvent,
  type TimedKeyInput,
} from "./attempt";
export {
  evaluateGoal,
  evaluateObjective,
  type GoalEvaluation,
  type ObjectiveEvaluation,
} from "./goal";
export {
  DEFAULT_ANTI_PATTERN_CONFIG,
  detectAntiPatterns,
  optimalKeystrokes,
  type AntiPatternConfig,
  type AntiPatternHit,
} from "./antipatterns";
export {
  DEFAULT_STRATEGY_CONFIG,
  DEFAULT_STRATEGY_RULES,
  classifyStrategy,
  type StrategyClassification,
  type StrategyConfig,
  type StrategyContext,
  type StrategyRule,
} from "./strategy";
export {
  DEFAULT_METRICS_CONFIG,
  computeMetrics,
  type AttemptMetrics,
  type LatencyBand,
  type MetricsConfig,
} from "./metrics";
export { canRevealHint, hintStatus, revealHint, type HintReveal, type HintStatus } from "./hints";
export {
  DEFAULT_EVALUATION_CONFIG,
  evaluateAttempt,
  type AttemptEvaluation,
  type EvaluationConfig,
} from "./evaluate";
export { simulateSolution } from "./simulate";
export { checkContent, checkExercise } from "./content-check";
export { describeFeedback, type Feedback, type FeedbackKind } from "./feedback";
export {
  buildReplay,
  ghostComparison,
  masterRun,
  runOf,
  type ReplayFrame,
  type Run,
  type RunSummary,
} from "./replay";
