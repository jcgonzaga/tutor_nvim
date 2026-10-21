import type { PedagogyConfig } from "./config";
import { clamp, DAY_MS, ema, lerp } from "./math";
import type { ReviewState, UserSkill } from "./types";

export interface ReviewAttempt {
  /** Epoch ms at which the attempt finished (the injected clock). */
  readonly at: number;
  readonly success: boolean;
  /** Performance score, 0-100. */
  readonly performance: number;
  readonly hintsUsed: number;
  /** Enough time passed since the previous attempt for this to be delayed recall (T-410). */
  readonly delayed: boolean;
}

export interface ScheduleResult {
  readonly review: ReviewState;
  /** Show this skill again after this many more exercises in the current session. */
  readonly inSessionAfter: number | null;
  /** The attempt was the scheduled spaced review (delayed and due), so the ladder may advance. */
  readonly scheduledReview: boolean;
  readonly lapse: boolean;
}

/**
 * Review scheduler v1 (T-406). Not SM-2: the next interval comes from a ladder indexed by the
 * learner's streak of spaced successes, then moves with how well the attempt went.
 *
 * - A lapse (failure, or a performance under the pass mark) resets the streak, halves the
 *   stability and brings the skill back within minutes and again within the session.
 * - A pass only advances the ladder when it is the scheduled review. Repeating the skill in the
 *   same session, or practicing it early, never pushes the next review further away.
 * - Hints, low efficiency or slow keys all lower the performance, which shortens the interval;
 *   leaning on a hint also stops the streak from growing.
 *
 * Pure: the clock is `attempt.at`, so the same history always yields the same schedule.
 */
export function scheduleReview(
  previous: ReviewState | null,
  attempt: ReviewAttempt,
  config: PedagogyConfig,
): ScheduleResult {
  const rules = config.scheduler;
  const performance = attempt.success ? clamp(attempt.performance) : 0;
  const difficulty = clamp(
    ema(
      previous?.difficulty ?? rules.initialDifficulty,
      1 - performance / 100,
      rules.difficultyRate,
    ),
    0,
    1,
  );

  if (!attempt.success || performance < rules.passMark) {
    const stability = clamp(
      (previous?.stability ?? 1) * rules.lapseStabilityFactor,
      rules.minStabilityDays,
      rules.maxStabilityDays,
    );
    return {
      review: {
        stability,
        difficulty,
        dueAt: attempt.at + rules.lapseRetryMs,
        lastPerformance: performance,
        streak: 0,
      },
      inSessionAfter: rules.inSession.afterLapse,
      scheduledReview: false,
      lapse: true,
    };
  }

  const leaned = attempt.hintsUsed > 0;
  const due = previous !== null && attempt.at >= previous.dueAt - rules.dueToleranceMs;
  const scheduledReview = previous !== null && attempt.delayed && due;
  const streak =
    previous === null ? 0 : scheduledReview && !leaned ? previous.streak + 1 : previous.streak;
  const inSessionAfter =
    previous === null || leaned || performance < rules.solidMark
      ? rules.inSession.afterShakyPass
      : null;

  // Not the scheduled review and nothing to recover from: extra practice leaves the date alone.
  const recovering = previous !== null && previous.lastPerformance < rules.passMark;
  if (previous !== null && !scheduledReview && !recovering && previous.dueAt > attempt.at) {
    return {
      review: { ...previous, difficulty, lastPerformance: performance, streak },
      inSessionAfter,
      scheduledReview,
      lapse: false,
    };
  }

  const rung = rules.intervalsDays[Math.min(streak, rules.intervalsDays.length - 1)] ?? 1;
  const factor = leaned
    ? rules.minIntervalFactor
    : lerp(
        rules.minIntervalFactor,
        rules.maxIntervalFactor,
        (performance - rules.passMark) / (100 - rules.passMark),
      );
  let days = rung * factor * (1.2 - 0.4 * difficulty);
  if (previous !== null) days = Math.min(days, previous.stability * rules.maxGrowth);
  days = clamp(days, rules.minStabilityDays, rules.maxStabilityDays);

  return {
    review: {
      stability: days,
      difficulty,
      dueAt: attempt.at + days * DAY_MS,
      lastPerformance: performance,
      streak,
    },
    inSessionAfter,
    scheduledReview,
    lapse: false,
  };
}

/**
 * Chance the learner still remembers the skill (0-1): 1 right after practice, 1/e once
 * `stability` days passed. Skills never attempted have nothing to forget (0).
 */
export function retrievability(skill: UserSkill, now: number): number {
  if (skill.review === null || skill.lastAttemptAt === null) return 0;
  const elapsedDays = Math.max(0, now - skill.lastAttemptAt) / DAY_MS;
  return Math.exp(-elapsedDays / skill.review.stability);
}

/** A skill is due when it has a review date that has arrived. */
export function isDue(skill: UserSkill, now: number): boolean {
  return skill.nextReviewAt !== null && skill.nextReviewAt <= now;
}

/** An exercise queued to reappear inside the current session (the "4 and 12 exercises" rule). */
export interface InSessionEntry {
  readonly skillId: string;
  /** Number of exercises completed in the session at which it becomes due. */
  readonly dueAtIndex: number;
}

/** Queues a skill; a skill already queued keeps whichever reappearance comes first. */
export function enqueueInSession(
  queue: readonly InSessionEntry[],
  skillId: string,
  afterExercises: number,
  completedInSession: number,
): InSessionEntry[] {
  const dueAtIndex = completedInSession + afterExercises;
  const existing = queue.find((entry) => entry.skillId === skillId);
  if (existing !== undefined && existing.dueAtIndex <= dueAtIndex) return [...queue];
  return [...queue.filter((entry) => entry.skillId !== skillId), { skillId, dueAtIndex }];
}

/** Splits the queue into entries due now (earliest first, ties by skill id) and the rest. */
export function takeDueInSession(
  queue: readonly InSessionEntry[],
  completedInSession: number,
): { readonly due: InSessionEntry[]; readonly rest: InSessionEntry[] } {
  const due = queue
    .filter((entry) => entry.dueAtIndex <= completedInSession)
    .sort((a, b) => a.dueAtIndex - b.dueAtIndex || a.skillId.localeCompare(b.skillId));
  const rest = queue.filter((entry) => entry.dueAtIndex > completedInSession);
  return { due, rest };
}
