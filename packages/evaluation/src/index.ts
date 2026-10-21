export {
  advanceAttempt,
  recordInput,
  startAttempt,
  type Attempt,
  type InputEvent,
  type TimedKeyInput,
} from "./attempt";
export { evaluateGoal, type GoalEvaluation } from "./goal";
export { classifyStrategy, type StrategyClassification } from "./strategy";
export {
  DEFAULT_METRICS_CONFIG,
  computeMetrics,
  type AttemptMetrics,
  type MetricsConfig,
} from "./metrics";
export { evaluateAttempt, type AttemptEvaluation } from "./evaluate";
export { simulateSolution } from "./simulate";
