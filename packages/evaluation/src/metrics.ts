import type { Exercise } from "@tutor-nvim/exercise-schema";
import type { Attempt } from "./attempt";
import { optimalKeystrokes } from "./antipatterns";
import type { StrategyClassification } from "./strategy";

/** A latency band: at or below `idealMs` scores 100, at or above `worstMs` scores 0, linear in between. */
export interface LatencyBand {
  readonly idealMs: number;
  readonly worstMs: number;
}

/** Scoring knobs live here, never in UI code. All scores are on a 0-100 scale. */
export interface MetricsConfig {
  readonly strategyScores: Readonly<Record<StrategyClassification, number>>;
  /** Weights of the performance score; they should add up to 1. */
  readonly weights: {
    readonly accuracy: number;
    readonly strategy: number;
    readonly efficiency: number;
    readonly fluency: number;
    readonly independence: number;
  };
  readonly fluency: {
    readonly firstInput: LatencyBand;
    readonly medianInterKey: LatencyBand;
    readonly maxInterKey: LatencyBand;
    /** Relative weight of each latency component inside the fluency score. */
    readonly weights: {
      readonly firstInput: number;
      readonly medianInterKey: number;
      readonly maxInterKey: number;
    };
  };
  /** Points taken off the independence score for each hint used. */
  readonly hintPenalty: number;
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
  // PRD 25: accuracy 35, strategy 25, efficiency 15, fluency 15, and a 10 weight the PRD calls
  // "recovery" without defining it; it is implemented as `independence` (see docs/architecture/m3).
  weights: { accuracy: 0.35, strategy: 0.25, efficiency: 0.15, fluency: 0.15, independence: 0.1 },
  fluency: {
    firstInput: { idealMs: 400, worstMs: 4000 },
    medianInterKey: { idealMs: 150, worstMs: 1500 },
    maxInterKey: { idealMs: 400, worstMs: 4000 },
    weights: { firstInput: 0.4, medianInterKey: 0.3, maxInterKey: 0.3 },
  },
  hintPenalty: 25,
};

export interface AttemptMetrics {
  readonly success: boolean;
  /** Share of inputs the engine accepted; 0 unless the task was solved. */
  readonly accuracyScore: number;
  readonly strategyScore: number;
  readonly efficiencyScore: number;
  /** Speed of the hands, scaled by accuracy so fast sloppy runs do not score; 0 unless solved. */
  readonly fluencyScore: number;
  /** Finishing without leaning on hints; 0 unless solved. */
  readonly independenceScore: number;
  readonly performanceScore: number;
  /** Time from the exercise being shown to the first input; `null` if there was none. */
  readonly firstInputLatencyMs: number | null;
  readonly medianInterKeyLatencyMs: number | null;
  readonly maxInterKeyLatencyMs: number | null;
  readonly totalDurationMs: number;
  /** Every logical input, including rejected ones. */
  readonly keystrokes: number;
  /** Keystrokes beyond the shortest optimal solution. */
  readonly unnecessaryKeystrokes: number;
  /**
   * Vim: rejected inputs. Shell: commands that failed (non-zero exit) plus rejected inputs, since a
   * mistyped command is the shell's way of saying the input was wrong.
   */
  readonly errors: number;
  readonly hintsUsed: number;
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(Math.max(value, min), max);

function latencyScore(ms: number | null, band: LatencyBand): number | null {
  if (ms === null) return null;
  return clamp((100 * (band.worstMs - ms)) / (band.worstMs - band.idealMs));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function computeMetrics(
  exercise: Exercise,
  attempt: Attempt,
  success: boolean,
  strategy: StrategyClassification,
  config: MetricsConfig = DEFAULT_METRICS_CONFIG,
): AttemptMetrics {
  const { events } = attempt;
  const keystrokes = events.length;
  const first = events[0];
  const last = events[keystrokes - 1];
  const end = attempt.completedAt ?? last?.timestamp ?? attempt.startedAt;
  const optimal = optimalKeystrokes(exercise);

  const gaps = events
    .slice(1)
    .map((event, index) => event.timestamp - (events[index]?.timestamp ?? 0));
  const firstInputLatencyMs = first === undefined ? null : first.timestamp - attempt.startedAt;
  const medianInterKeyLatencyMs = median(gaps);
  const maxInterKeyLatencyMs = gaps.length === 0 ? null : Math.max(...gaps);

  const rejected = events.filter((event) => !event.accepted).length;
  // In the shell the keys of a failed command were spent for nothing: they count against accuracy.
  const failedCommands =
    attempt.kind === "shell"
      ? attempt.state.transcript.filter((entry) => entry.status !== 0 && entry.status !== 130)
      : [];
  const errors = rejected + failedCommands.length;
  const wastedKeys = rejected + failedCommands.reduce((sum, entry) => sum + entry.keys, 0);
  const hintsUsed = attempt.hints.length;

  const accuracyScore =
    success && keystrokes > 0 ? clamp((100 * (keystrokes - wastedKeys)) / keystrokes) : 0;
  const efficiencyScore = success && keystrokes > 0 ? clamp((100 * optimal) / keystrokes) : 0;
  const strategyScore = config.strategyScores[strategy];
  const independenceScore = success ? clamp(100 - config.hintPenalty * hintsUsed) : 0;

  // Weighted mean of the latency components that exist (a one-key attempt has no inter-key gaps).
  const parts = [
    [
      latencyScore(firstInputLatencyMs, config.fluency.firstInput),
      config.fluency.weights.firstInput,
    ],
    [
      latencyScore(medianInterKeyLatencyMs, config.fluency.medianInterKey),
      config.fluency.weights.medianInterKey,
    ],
    [
      latencyScore(maxInterKeyLatencyMs, config.fluency.maxInterKey),
      config.fluency.weights.maxInterKey,
    ],
  ] as const;
  const present = parts.filter((part): part is readonly [number, number] => part[0] !== null);
  const totalWeight = present.reduce((sum, [, weight]) => sum + weight, 0);
  const rawFluency =
    totalWeight === 0
      ? 0
      : present.reduce((sum, [score, weight]) => sum + score * weight, 0) / totalWeight;
  // Accuracy before speed: speed only counts in proportion to how clean the run was.
  const fluencyScore = success ? (rawFluency * accuracyScore) / 100 : 0;

  const { weights } = config;
  const performanceScore = clamp(
    accuracyScore * weights.accuracy +
      strategyScore * weights.strategy +
      efficiencyScore * weights.efficiency +
      fluencyScore * weights.fluency +
      independenceScore * weights.independence,
  );

  return {
    success,
    accuracyScore,
    strategyScore,
    efficiencyScore,
    fluencyScore,
    independenceScore,
    performanceScore,
    firstInputLatencyMs,
    medianInterKeyLatencyMs,
    maxInterKeyLatencyMs,
    totalDurationMs: end - attempt.startedAt,
    keystrokes,
    unnecessaryKeystrokes: Math.max(0, keystrokes - optimal),
    errors,
    hintsUsed,
  };
}
