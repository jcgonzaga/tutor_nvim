import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { ContentBundle } from "@tutor-nvim/exercise-schema";
import {
  DEFAULT_PEDAGOGY_CONFIG,
  type AttemptRecord,
  type PedagogyConfig,
  type PersonalBest,
  type SessionHistoryEntry,
} from "@tutor-nvim/pedagogy";
import type { ProgressSnapshot } from "@tutor-nvim/shared";
import type { Db } from "../db/client";
import { attempts, personalBests, sessionExercises, sessions } from "../db/schema";
import { loadGamification } from "./gamification";
import { loadLearner } from "./learner";
import { getSettings } from "./users";

/** The most recent attempts, oldest first, in the shape the session builder reads. */
export async function loadHistory(
  db: Db,
  bundle: ContentBundle,
  userId: string,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): Promise<AttemptRecord[]> {
  const rows = await db
    .select({
      exerciseId: attempts.exerciseId,
      finishedAt: attempts.finishedAt,
      success: attempts.success,
      performance: attempts.performanceScore,
    })
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.finishedAt), desc(attempts.createdAt))
    .limit(config.profile.maxHistory);
  const skillsOf = new Map(bundle.exercises.map((exercise) => [exercise.id, exercise.skillIds]));
  return rows.reverse().map((row) => ({
    exerciseId: row.exerciseId,
    skillIds: skillsOf.get(row.exerciseId) ?? [],
    at: row.finishedAt,
    success: row.success,
    performance: row.performance,
  }));
}

async function loadSessionHistory(
  db: Db,
  userId: string,
  config: PedagogyConfig,
): Promise<SessionHistoryEntry[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNotNull(sessions.finishedAt)))
    .orderBy(desc(sessions.startedAt))
    .limit(config.profile.maxSessionSummaries);
  if (rows.length === 0) return [];

  const played = await db
    .select({
      sessionId: sessionExercises.sessionId,
      success: attempts.success,
      scheduledReview: attempts.scheduledReview,
      xp: attempts.xp,
    })
    .from(sessionExercises)
    .innerJoin(attempts, eq(attempts.id, sessionExercises.attemptId))
    .where(
      inArray(
        sessionExercises.sessionId,
        rows.map((row) => row.id),
      ),
    );

  return rows
    .reverse()
    .map((row): SessionHistoryEntry => {
      const mine = played.filter((entry) => entry.sessionId === row.id);
      return {
        date: row.date,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt ?? row.startedAt,
        exercises: mine.length,
        successes: mine.filter((entry) => entry.success).length,
        reviewsCompleted: mine.filter((entry) => entry.scheduledReview).length,
        abandoned: row.abandoned,
        xp: mine.reduce((sum, entry) => sum + entry.xp, 0) + row.bonusXp,
      };
    })
    .filter((entry) => !(entry.abandoned && entry.exercises === 0));
}

/** `GET /api/progress`: the server-authoritative state a client replaces its local progress with. */
export async function buildSnapshot(
  db: Db,
  bundle: ContentBundle,
  userId: string,
  now: number,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): Promise<ProgressSnapshot> {
  const [settings, learner, history, bests, sessionEntries, gamification] = await Promise.all([
    getSettings(db, userId),
    loadLearner(db, userId),
    loadHistory(db, bundle, userId, config),
    db.select().from(personalBests).where(eq(personalBests.userId, userId)),
    loadSessionHistory(db, userId, config),
    loadGamification(db, bundle, userId),
  ]);
  const personal: Record<string, PersonalBest> = Object.fromEntries(
    bests.map((row) => [
      row.exerciseId,
      {
        time: row.time,
        efficiency: row.efficiency,
        performance: row.performance,
        reaction: row.reaction,
      },
    ]),
  );
  return {
    userId,
    settings,
    learner,
    history,
    personalBests: personal,
    sessions: sessionEntries,
    gamification,
    generatedAt: now,
  };
}
