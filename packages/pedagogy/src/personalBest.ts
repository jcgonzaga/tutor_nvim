/**
 * Personal bests (T-804 stores the same four; M5 needs them for the end-of-session summary).
 * Per exercise, only successful attempts count, and "improved" means beating an earlier best:
 * the first success sets the baseline and is not a record.
 */
export const PERSONAL_BEST_METRICS = ["time", "efficiency", "performance", "reaction"] as const;
export type PersonalBestMetric = (typeof PERSONAL_BEST_METRICS)[number];

/** Lower is better for `time` and `reaction`; higher for `efficiency` and `performance`. */
export interface PersonalBest {
  readonly time: number | null;
  readonly efficiency: number | null;
  readonly performance: number | null;
  readonly reaction: number | null;
}

export interface BestInput {
  readonly success: boolean;
  readonly totalDurationMs: number;
  readonly efficiencyScore: number;
  readonly performanceScore: number;
  readonly firstInputLatencyMs: number | null;
}

export const NO_BEST: PersonalBest = {
  time: null,
  efficiency: null,
  performance: null,
  reaction: null,
};

const LOWER_IS_BETTER: ReadonlySet<PersonalBestMetric> = new Set(["time", "reaction"]);

function valueOf(input: BestInput, metric: PersonalBestMetric): number | null {
  switch (metric) {
    case "time":
      return input.totalDurationMs;
    case "efficiency":
      return input.efficiencyScore;
    case "performance":
      return input.performanceScore;
    case "reaction":
      return input.firstInputLatencyMs;
  }
}

export function updatePersonalBest(
  previous: PersonalBest | undefined,
  input: BestInput,
): { readonly best: PersonalBest; readonly improved: readonly PersonalBestMetric[] } {
  if (!input.success) return { best: previous ?? NO_BEST, improved: [] };

  const before = previous ?? NO_BEST;
  const best: Record<PersonalBestMetric, number | null> = { ...before };
  const improved: PersonalBestMetric[] = [];

  for (const metric of PERSONAL_BEST_METRICS) {
    const value = valueOf(input, metric);
    if (value === null) continue;
    const current = before[metric];
    const better =
      current === null || (LOWER_IS_BETTER.has(metric) ? value < current : value > current);
    if (!better) continue;
    best[metric] = value;
    if (current !== null) improved.push(metric);
  }
  return { best, improved };
}
