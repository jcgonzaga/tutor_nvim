import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { ContentBundle } from "@tutor-nvim/exercise-schema";
import {
  DEFAULT_GAMIFICATION_CONFIG,
  EMPTY_STREAK,
  recordCompletedDay,
  type ComboState,
  type GamificationConfig,
  type GamificationState,
  type PersonalBestMetric,
  type RecentBest,
  type RunRecord,
  type StreakState,
} from "@tutor-nvim/pedagogy";
import { streakStateSchema } from "@tutor-nvim/shared";
import type { Db } from "../db/client";
import { attemptEvents, attempts, sessions, userGamification } from "../db/schema";

/** The learner's local day for an attempt: what the client said, else the UTC day it finished. */
export const dayOfAttempt = (localDay: string | null | undefined, finishedAt: number): string =>
  localDay ?? new Date(finishedAt).toISOString().slice(0, 10);

/** The session's combo before the next attempt, rebuilt from the attempts already recorded in it. */
export async function comboBefore(db: Db, userId: string, sessionId: string): Promise<ComboState> {
  const rows = await db
    .select({ comboAfter: attempts.comboAfter })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.sessionId, sessionId)))
    .orderBy(asc(attempts.finishedAt), asc(attempts.createdAt));
  const values = rows.map((row) => row.comboAfter ?? 0);
  return { current: values[values.length - 1] ?? 0, best: Math.max(0, ...values) };
}

/** Earlier successes at an exercise, and the attempt XP already earned, on one local day. */
export async function dayTotals(
  db: Db,
  userId: string,
  exerciseId: string,
  day: string,
): Promise<{ priorCompletions: number; xpToday: number }> {
  const [row] = await db
    .select({
      prior: sql<number>`coalesce(sum(case when ${attempts.exerciseId} = ${exerciseId} and ${attempts.success} then 1 else 0 end), 0)::int`,
      xp: sql<number>`coalesce(sum(${attempts.xp}), 0)::int`,
    })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        sql`coalesce(${attempts.localDay}, to_char(to_timestamp(${attempts.finishedAt} / 1000.0) at time zone 'UTC', 'YYYY-MM-DD')) = ${day}`,
      ),
    );
  return { priorCompletions: row?.prior ?? 0, xpToday: row?.xp ?? 0 };
}

/**
 * XP for finishing the day's first completed session. Another completed session of the same
 * local day that already got it means this one earns none.
 */
export async function dailyBonusFor(
  db: Db,
  userId: string,
  sessionId: string,
  date: string,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): Promise<number> {
  const [taken] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.date, date),
        isNotNull(sessions.finishedAt),
        eq(sessions.abandoned, false),
        sql`${sessions.bonusXp} > 0`,
        sql`${sessions.id} <> ${sessionId}`,
      ),
    );
  return (taken?.n ?? 0) > 0 ? 0 : config.xp.dailyCompletionBonus;
}

/**
 * The game layer as the server sees it, derived entirely from what it recorded: attempt XP and
 * combos it computed itself, the daily bonuses, the streak replayed over the completed days, the
 * best run of each exercise and the latest personal bests. The same pure functions the device uses
 * produced those numbers, so both agree (ADR-0003 section 9).
 */
export async function loadGamification(
  db: Db,
  bundle: ContentBundle,
  userId: string,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): Promise<GamificationState> {
  const [baseline] = await db
    .select()
    .from(userGamification)
    .where(eq(userGamification.userId, userId));
  const baselineStreak = streakStateSchema.safeParse(baseline?.baselineStreak);

  const [attemptTotals] = await db
    .select({
      xp: sql<number>`coalesce(sum(${attempts.xp}), 0)::int`,
      combo: sql<number>`coalesce(max(${attempts.comboAfter}), 0)::int`,
    })
    .from(attempts)
    .where(eq(attempts.userId, userId));
  const [bonusTotals] = await db
    .select({ xp: sql<number>`coalesce(sum(${sessions.bonusXp}), 0)::int` })
    .from(sessions)
    .where(eq(sessions.userId, userId));

  const perDay = await db
    .select({
      day: sql<string>`coalesce(${attempts.localDay}, to_char(to_timestamp(${attempts.finishedAt} / 1000.0) at time zone 'UTC', 'YYYY-MM-DD'))`,
      xp: sql<number>`coalesce(sum(${attempts.xp}), 0)::int`,
    })
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .groupBy(sql`1`)
    .orderBy(desc(sql`1`))
    .limit(config.keep.xpDays);
  const xpByDay = Object.fromEntries(
    perDay.filter((row) => row.xp > 0).map((row) => [row.day, row.xp]),
  );

  const completedDays = await db
    .selectDistinct({ date: sessions.date })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNotNull(sessions.finishedAt),
        eq(sessions.abandoned, false),
      ),
    )
    .orderBy(asc(sessions.date));
  const streak: StreakState = completedDays.reduce(
    (state, row) => recordCompletedDay(state, row.date, config),
    baselineStreak.success ? baselineStreak.data : EMPTY_STREAK,
  );

  const bests = await db
    .select({
      exerciseId: attempts.exerciseId,
      improved: attempts.improved,
      at: attempts.finishedAt,
    })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), sql`jsonb_array_length(${attempts.improved}) > 0`))
    .orderBy(desc(attempts.finishedAt), desc(attempts.createdAt))
    .limit(config.keep.recentBests);
  const recentBests: RecentBest[] = bests.reverse().map((row) => ({
    exerciseId: row.exerciseId,
    metrics: row.improved as PersonalBestMetric[],
    at: row.at,
  }));

  return {
    xp: (baseline?.baselineXp ?? 0) + (attemptTotals?.xp ?? 0) + (bonusTotals?.xp ?? 0),
    xpByDay,
    streak,
    bestCombo: Math.max(baseline?.baselineBestCombo ?? 0, attemptTotals?.combo ?? 0),
    recentBests,
    bestRuns: await loadBestRuns(db, bundle, userId),
  };
}

/** The best solved attempt of each exercise, as a replayable run. A tie keeps the earliest, like the device. */
async function loadBestRuns(
  db: Db,
  bundle: ContentBundle,
  userId: string,
): Promise<Record<string, RunRecord>> {
  const result = await db.execute(sql`
    select distinct on (exercise_id) id, exercise_id, performance_score, finished_at, started_ms, metrics
    from ${attempts}
    where user_id = ${userId} and success
    order by exercise_id, performance_score desc, finished_at asc, created_at asc
  `);
  const best = (result as unknown as { rows: BestRow[] }).rows;
  if (best.length === 0) return {};

  const events = await db
    .select({
      attemptId: attemptEvents.attemptId,
      key: attemptEvents.logicalKey,
      at: attemptEvents.timestampMs,
    })
    .from(attemptEvents)
    .where(
      inArray(
        attemptEvents.attemptId,
        best.map((row) => row.id),
      ),
    )
    .orderBy(asc(attemptEvents.attemptId), asc(attemptEvents.sequence));

  const known = new Set(bundle.exercises.map((exercise) => exercise.id));
  const runs: Record<string, RunRecord> = {};
  for (const row of best) {
    if (!known.has(row.exercise_id)) continue;
    const mine = events.filter((event) => event.attemptId === row.id);
    if (mine.length === 0) continue;
    const start = row.started_ms ?? mine[0]?.at ?? 0;
    const metrics = row.metrics as { totalDurationMs?: number };
    runs[row.exercise_id] = {
      keys: mine.map((event) => event.key),
      times: mine.map((event) => Math.max(0, event.at - start)),
      durationMs:
        metrics.totalDurationMs ?? Math.max(0, (mine[mine.length - 1]?.at ?? start) - start),
      performance: Math.min(100, Math.max(0, row.performance_score)),
      at: Number(row.finished_at),
    };
  }
  return runs;
}

interface BestRow {
  id: string;
  exercise_id: string;
  performance_score: number;
  finished_at: number | string;
  started_ms: number | null;
  metrics: unknown;
}
