import type { Exercise } from "@tutor-nvim/exercise-schema";
import type { Attempt } from "./attempt";
import type { StrategyClassification } from "./strategy";

/** Scoring knobs live here, never in UI code. All scores are on a 0-100 scale. */
export interface MetricsConfig {
  readonly strategyScores: Readonly<Record<StrategyClassification, number>>;
}

export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  strategyScores: {
    optimal: 100,
    efficient: 85,
    valid: 70,
    inefficient: 45,
    "anti-pattern": 20,
    failed: 0,
  },
};

export interface AttemptMetrics {
  readonly success: boolean;
  readonly strategyScore: number;
  readonly efficiencyScore: number;
  /** Time from the exercise being shown to the first input; `null` if there was none. */
  readonly firstInputLatencyMs: number | null;
  readonly totalDurationMs: number;
  /** Every logical input, including rejected ones. */
  readonly keystrokes: number;
}

export function computeMetrics(
  exercise: Exercise,
  attempt: Attempt,
  success: boolean,
  strategy: StrategyClassification,
  config: MetricsConfig = DEFAULT_METRICS_CONFIG,
): AttemptMetrics {
  const { events } = attempt;
  const first = events[0];
  const last = events[events.length - 1];
  const end = attempt.completedAt ?? last?.timestamp ?? attempt.startedAt;

  return {
    success,
    strategyScore: config.strategyScores[strategy],
    efficiencyScore: success ? efficiencyScore(exercise, events.length) : 0,
    firstInputLatencyMs: first === undefined ? null : first.timestamp - attempt.startedAt,
    totalDurationMs: end - attempt.startedAt,
    keystrokes: events.length,
  };
}

/** Ratio of the shortest reference solution to the keystrokes actually used. */
function efficiencyScore(exercise: Exercise, keystrokes: number): number {
  if (keystrokes === 0) return 0;
  const optimal = exercise.solutions.filter((solution) => solution.classification === "optimal");
  const references = optimal.length > 0 ? optimal : exercise.solutions;
  const shortest = Math.min(...references.map((solution) => solution.keys.length));
  return Math.min(100, (shortest / keystrokes) * 100);
}
