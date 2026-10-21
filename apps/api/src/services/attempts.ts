import { and, eq, isNull, sql } from "drizzle-orm";
import {
  advanceAttempt,
  evaluateAttempt,
  giveUpAttempt,
  startAttempt,
  type Attempt,
  type AttemptEvaluation,
} from "@tutor-nvim/evaluation";
import type { ContentBundle, Exercise } from "@tutor-nvim/exercise-schema";
import {
  NO_BEST,
  recordAttempt,
  updatePersonalBest,
  type PersonalBest,
  type PersonalBestMetric,
} from "@tutor-nvim/pedagogy";
import type { AttemptResult, AttemptSubmission } from "@tutor-nvim/shared";
import type { Db } from "../db/client";
import {
  attemptEvents,
  attempts,
  personalBests,
  sessionExercises,
  sessions,
  users,
} from "../db/schema";
import { HttpError } from "../errors";
import { loadLearner, saveLearner } from "./learner";

/** An attempt may not claim to have finished further in the future than clock skew explains. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Rebuilds the attempt from what the learner did and evaluates it with the same engine and
 * evaluation the client uses. The client's own score is never read (AGENTS 26).
 */
export function replaySubmission(
  exercise: Exercise,
  submission: AttemptSubmission,
): { attempt: Attempt; evaluation: AttemptEvaluation } {
  let attempt = startAttempt(exercise, submission.startedAt);
  for (const event of submission.events) {
    attempt = advanceAttempt(exercise, attempt, {
      key: event.key,
      ...(event.code ? { code: event.code } : {}),
      ctrl: event.ctrl,
      alt: event.alt,
      shift: event.shift,
      meta: event.meta,
      timestamp: event.timestamp,
    });
  }
  attempt = { ...attempt, hints: submission.hints };
  if (submission.gaveUp && attempt.completedAt === null) {
    const last = attempt.events[attempt.events.length - 1];
    attempt = giveUpAttempt(
      attempt,
      submission.completedAt ?? last?.timestamp ?? submission.startedAt,
    );
  }
  return { attempt, evaluation: evaluateAttempt(exercise, attempt) };
}

type AttemptRow = typeof attempts.$inferSelect;

function resultFromRow(row: AttemptRow, duplicate: boolean): AttemptResult {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    success: row.success,
    strategy: row.strategy,
    performanceScore: row.performanceScore,
    improved: [],
    duplicate,
  };
}

/**
 * Records one finished attempt: replays and evaluates it, applies it to the learner's skills
 * (evidence, mastery, review schedule, stages), updates personal bests and stores the attempt with
 * every logical input. Idempotent on the client-generated id. Attempts of one user are serialized
 * by locking the user row, so two devices uploading at once cannot overwrite each other's state.
 */
export async function recordSubmission(
  db: Db,
  bundle: ContentBundle,
  userId: string,
  submission: AttemptSubmission,
  now: number,
): Promise<AttemptResult> {
  const exercise = bundle.exercises.find((candidate) => candidate.id === submission.exerciseId);
  if (!exercise) {
    throw new HttpError(422, "unknown_exercise", `Unknown exercise ${submission.exerciseId}`);
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${users} where ${users.id} = ${userId} for update`);

    const [existing] = await tx.select().from(attempts).where(eq(attempts.id, submission.id));
    if (existing) {
      if (existing.userId !== userId) {
        throw new HttpError(409, "attempt_conflict", "This attempt id belongs to someone else");
      }
      return resultFromRow(existing, true);
    }

    const { attempt, evaluation } = replaySubmission(exercise, submission);
    const { metrics } = evaluation;

    const learner = await loadLearner(tx, userId);
    // Keep history in order: an attempt from an older device cannot land before what is stored.
    const lastSeen = Math.max(
      0,
      ...exercise.skillIds.map((slug) => learner.skills[slug]?.lastAttemptAt ?? 0),
    );
    const at = Math.max(Math.min(submission.finishedAt, now + MAX_CLOCK_SKEW_MS), lastSeen);

    const recorded = recordAttempt(bundle.skills, learner, { exercise, outcome: metrics, at });
    await saveLearner(tx, userId, recorded.learner);

    const [storedBest] = await tx
      .select()
      .from(personalBests)
      .where(and(eq(personalBests.userId, userId), eq(personalBests.exerciseId, exercise.id)));
    const previousBest: PersonalBest | undefined = storedBest
      ? {
          time: storedBest.time,
          efficiency: storedBest.efficiency,
          performance: storedBest.performance,
          reaction: storedBest.reaction,
        }
      : undefined;
    const { best, improved } = updatePersonalBest(previousBest ?? NO_BEST, metrics);
    await tx
      .insert(personalBests)
      .values({ userId, exerciseId: exercise.id, ...best })
      .onConflictDoUpdate({ target: [personalBests.userId, personalBests.exerciseId], set: best });

    // The slot in the session is filled now if the client already registered the session;
    // otherwise `POST /api/sessions` links it later through `attempts.session_id`.
    const [session] = submission.sessionId
      ? await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(and(eq(sessions.id, submission.sessionId), eq(sessions.userId, userId)))
      : [];

    await tx.insert(attempts).values({
      id: submission.id,
      userId,
      exerciseId: exercise.id,
      sessionId: submission.sessionId ?? null,
      finishedAt: at,
      success: evaluation.success,
      gaveUp: submission.gaveUp,
      strategy: evaluation.strategy,
      performanceScore: metrics.performanceScore,
      metrics,
      hintsUsed: metrics.hintsUsed,
      scheduledReview: recorded.updates.some((update) => update.scheduledReview),
    });

    if (attempt.events.length > 0) {
      await tx.insert(attemptEvents).values(
        attempt.events.map((event) => ({
          attemptId: submission.id,
          sequence: event.sequence,
          timestampMs: event.timestamp,
          key: event.key,
          code: event.code,
          logicalKey: event.logicalKey,
          ctrl: event.ctrl,
          alt: event.alt,
          shift: event.shift,
          meta: event.meta,
          mode: event.mode,
          cursorBeforeLine: event.cursorBefore.line,
          cursorBeforeColumn: event.cursorBefore.column,
          cursorAfterLine: event.cursorAfter.line,
          cursorAfterColumn: event.cursorAfter.column,
          accepted: event.accepted,
        })),
      );
    }

    if (session) {
      await linkAttemptToSession(tx, session.id, submission.id, exercise.id);
    }

    return {
      id: submission.id,
      exerciseId: exercise.id,
      success: evaluation.success,
      strategy: evaluation.strategy,
      performanceScore: metrics.performanceScore,
      improved: improved as PersonalBestMetric[],
      duplicate: false,
    };
  });
}

/** Attaches the attempt to the first still-unplayed slot of its exercise in the session. */
export async function linkAttemptToSession(
  db: Db,
  sessionId: string,
  attemptId: string,
  exerciseId: string,
): Promise<void> {
  const [slot] = await db
    .select({ position: sessionExercises.position })
    .from(sessionExercises)
    .where(
      and(
        eq(sessionExercises.sessionId, sessionId),
        eq(sessionExercises.exerciseId, exerciseId),
        isNull(sessionExercises.attemptId),
      ),
    )
    .orderBy(sessionExercises.position)
    .limit(1);
  if (slot) {
    await db
      .update(sessionExercises)
      .set({ attemptId })
      .where(
        and(
          eq(sessionExercises.sessionId, sessionId),
          eq(sessionExercises.position, slot.position),
        ),
      );
  }
}
