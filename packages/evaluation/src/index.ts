export {
  advanceAttempt,
  advanceWorkspaceAttempt,
  advanceWorkspaceKey,
  giveUpAttempt,
  recordInput,
  recordWorkspaceAction,
  startAttempt,
  type Attempt,
  type InputEvent,
  type ShellAttempt,
  type TimedKeyInput,
  type VimAttempt,
  type WorkspaceActionRecording,
  type WorkspaceAttempt,
  type WorkspaceKeyRecording,
} from "./attempt";
export {
  evaluateGoal,
  evaluateObjective,
  evaluateShellGoal,
  evaluateShellObjective,
  goalMet,
  type GoalEvaluation,
  type ObjectiveEvaluation,
  type ShellGoalEvaluation,
  type ShellObjectiveEvaluation,
} from "./goal";
export {
  evaluateWorkspaceGoal,
  evaluateWorkspaceObjective,
  type WorkspaceGoalEvaluation,
  type WorkspaceObjectiveEvaluation,
} from "./workspace-goal";
export {
  simulateWorkspaceSolution,
  type RefusedWorkspaceAction,
  type WorkspaceReplay,
} from "./workspace-replay";
export {
  DEFAULT_ANTI_PATTERN_CONFIG,
  detectAntiPatterns,
  optimalCost,
  optimalKeystrokes,
  type AntiPatternConfig,
  type AntiPatternHit,
} from "./antipatterns";
export {
  DEFAULT_STRATEGY_CONFIG,
  DEFAULT_STRATEGY_RULES,
  classifyStrategy,
  efficiencyClassification,
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
export {
  evaluateActionAttempt,
  type ActionAttempt,
  type ActionAttemptEvaluation,
  type DeclaredActions,
  type PerformedAction,
  type RecordedInput,
} from "./action-attempt";
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
export {
  DEFAULT_EXPLANATION_CONFIG,
  planExplanation,
  type ExplanationConfig,
  type ExplanationPlan,
  type ExplanationReason,
} from "./explain";
