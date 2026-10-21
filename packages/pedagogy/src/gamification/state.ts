import type { PersonalBestMetric } from "../personalBest";
import { DEFAULT_GAMIFICATION_CONFIG, type GamificationConfig } from "./config";
import { EMPTY_STREAK, type StreakState } from "./streak";

/**
 * One finished run, compact enough to keep per exercise: the logical keys (`ci"`, `<Esc>`) and the
 * time of each one since the attempt started. It is what the ghost comparison and the replay
 * (T-805, T-806) are built from.
 */
export interface RunRecord {
  readonly keys: readonly string[];
  /** Milliseconds since the attempt started, one per key. */
  readonly times: readonly number[];
  readonly durationMs: number;
  readonly performance: number;
  /** Epoch ms at which the run finished. */
  readonly at: number;
}

export interface RecentBest {
  readonly exerciseId: string;
  readonly metrics: readonly PersonalBestMetric[];
  readonly at: number;
}

/**
 * Everything the game layer remembers. It holds no mastery and no learner state, and nothing in
 * the pedagogy engine reads it: XP is participation, mastery is competence (AGENTS 2.7).
 */
export interface GamificationState {
  /** Lifetime XP. */
  readonly xp: number;
  /** Attempt XP earned per day (`YYYY-MM-DD`), for the daily cap. Only recent days are kept. */
  readonly xpByDay: Readonly<Record<string, number>>;
  readonly streak: StreakState;
  /** Best combo ever reached. */
  readonly bestCombo: number;
  /** Latest personal bests, newest last. */
  readonly recentBests: readonly RecentBest[];
  /** The best run of each exercise, by performance. */
  readonly bestRuns: Readonly<Record<string, RunRecord>>;
}

export const EMPTY_GAMIFICATION: GamificationState = {
  xp: 0,
  xpByDay: {},
  streak: EMPTY_STREAK,
  bestCombo: 0,
  recentBests: [],
  bestRuns: {},
};

export const xpOn = (state: GamificationState, day: string): number => state.xpByDay[day] ?? 0;

/** Adds XP to the lifetime total; `counted` also adds it to the day's cap (attempt XP only). */
export function addXp(
  state: GamificationState,
  day: string,
  amount: number,
  counted: boolean,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): GamificationState {
  if (amount <= 0) return state;
  const xpByDay = counted ? { ...state.xpByDay, [day]: xpOn(state, day) + amount } : state.xpByDay;
  const keptDays = Object.keys(xpByDay).sort().slice(-config.keep.xpDays);
  return {
    ...state,
    xp: state.xp + amount,
    xpByDay: Object.fromEntries(keptDays.map((key) => [key, xpByDay[key] ?? 0])),
  };
}

/** Keeps the better of the stored run and this one. Only solved runs are offered. */
export function rememberBestRun(
  state: GamificationState,
  exerciseId: string,
  run: RunRecord,
): GamificationState {
  const existing = state.bestRuns[exerciseId];
  if (existing && existing.performance >= run.performance) return state;
  return { ...state, bestRuns: { ...state.bestRuns, [exerciseId]: run } };
}

export function rememberRecentBest(
  state: GamificationState,
  best: RecentBest,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): GamificationState {
  if (best.metrics.length === 0) return state;
  return {
    ...state,
    recentBests: [...state.recentBests, best].slice(-config.keep.recentBests),
  };
}
