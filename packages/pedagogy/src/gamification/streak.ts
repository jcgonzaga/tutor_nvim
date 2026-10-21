import { DEFAULT_GAMIFICATION_CONFIG, type GamificationConfig } from "./config";

export interface StreakState {
  /** Consecutive daily sessions, counting the forgiven gaps. */
  readonly current: number;
  readonly longest: number;
  /** Last day (`YYYY-MM-DD`) a daily session was completed. */
  readonly lastDay: string | null;
}

export const EMPTY_STREAK: StreakState = { current: 0, longest: 0, lastDay: null };

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Calendar days, so DST cannot skew it. */
export function dayDiff(from: string, to: string): number {
  const parse = (day: string): number => {
    const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((parse(to) - parse(from)) / DAY_MS);
}

/**
 * Records that a daily session was completed on `day` (T-803). Completing another session the same
 * day changes nothing. A gap of up to `graceDays` missed days keeps the streak going; a longer one
 * starts it again at 1, and `longest` is never taken away. A day earlier than the last one (a clock
 * set back) is ignored rather than punished.
 */
export function recordCompletedDay(
  state: StreakState,
  day: string,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): StreakState {
  if (state.lastDay === null)
    return { current: 1, longest: Math.max(1, state.longest), lastDay: day };
  const gap = dayDiff(state.lastDay, day);
  if (gap <= 0) return state;

  const current = gap <= 1 + config.streak.graceDays ? state.current + 1 : 1;
  return { current, longest: Math.max(state.longest, current), lastDay: day };
}

/**
 * The streak to show on `today`: still counted while it can be continued, otherwise 0 (but
 * `longest` stays). It never reports "at risk": a streak is something to be proud of, not a threat.
 */
export function currentStreak(
  state: StreakState,
  today: string,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): number {
  if (state.lastDay === null) return 0;
  return dayDiff(state.lastDay, today) <= 1 + config.streak.graceDays ? state.current : 0;
}

export const completedToday = (state: StreakState, today: string): boolean =>
  state.lastDay === today;
