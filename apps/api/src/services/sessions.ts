import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { ContentBundle } from "@tutor-nvim/exercise-schema";
import {
  SESSION_BLOCKS,
  buildDailySession,
  type DailySession,
  type SessionBlock,
  type SessionItem,
} from "@tutor-nvim/pedagogy";
import type { DailySessionResponse, SessionRecord, SessionSubmission } from "@tutor-nvim/shared";
import type { Db } from "../db/client";
import { attempts, sessionExercises, sessions } from "../db/schema";
import { HttpError } from "../errors";
import { linkAttemptToSession } from "./attempts";
import { loadLearner } from "./learner";
import { loadHistory } from "./progress";

function planFromRows(
  userId: string,
  date: string,
  seed: string,
  rows: readonly (typeof sessionExercises.$inferSelect)[],
): DailySession {
  const blocks = Object.fromEntries(
    SESSION_BLOCKS.map((block) => [block, [] as SessionItem[]]),
  ) as Record<SessionBlock, SessionItem[]>;
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    const block = SESSION_BLOCKS.find((candidate) => candidate === row.block);
    if (!block) continue;
    blocks[block].push({
      exerciseId: row.exerciseId,
      skillId: row.skillSlug,
      block,
      reason: row.reason,
    });
  }
  return { userId, date, seed, ...blocks };
}

/**
 * `GET /api/session/daily` (T-605). Builds the day's plan from the server's authoritative learner
 * state with the same deterministic builder the client uses, and stores it, so asking again for the
 * same day and seed returns the same session rather than a reshuffled one.
 */
export async function getOrCreateDailySession(
  db: Db,
  bundle: ContentBundle,
  userId: string,
  request: { date: string; seed: string },
  now: number,
): Promise<DailySessionResponse> {
  const [existing] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.date, request.date),
        eq(sessions.seed, request.seed),
        isNull(sessions.finishedAt),
      ),
    )
    .orderBy(desc(sessions.startedAt))
    .limit(1);

  if (existing) {
    const rows = await db
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.sessionId, existing.id));
    return {
      sessionId: existing.id,
      plan: planFromRows(userId, request.date, request.seed, rows),
    };
  }

  const learner = await loadLearner(db, userId);
  const history = await loadHistory(db, bundle, userId);
  const plan = buildDailySession({
    userId,
    date: request.date,
    ...(request.seed ? { seed: request.seed } : {}),
    now,
    skills: bundle.skills,
    exercises: bundle.exercises,
    learner,
    history,
  });

  const sessionId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: sessionId,
      userId,
      date: request.date,
      seed: request.seed,
      startedAt: now,
    });
    const items = SESSION_BLOCKS.flatMap((block) => plan[block]);
    if (items.length > 0) {
      await tx.insert(sessionExercises).values(
        items.map((item, position) => ({
          sessionId,
          position,
          exerciseId: item.exerciseId,
          skillSlug: item.skillId,
          block: item.block,
          reason: item.reason,
          repeat: false,
        })),
      );
    }
  });
  return { sessionId, plan };
}

/**
 * `POST /api/sessions` (T-605): registers or updates a session the client ran, by its
 * client-generated id. The items replace any earlier ones; attempts already uploaded for them are
 * linked, so the order of uploads (session first or attempts first) does not matter.
 */
export async function submitSession(
  db: Db,
  bundle: ContentBundle,
  userId: string,
  submission: SessionSubmission,
): Promise<SessionRecord> {
  const exerciseIds = new Set(bundle.exercises.map((exercise) => exercise.id));
  const skillSlugs = new Set(bundle.skills.map((skill) => skill.slug));
  for (const item of submission.items) {
    if (!exerciseIds.has(item.exerciseId)) {
      throw new HttpError(422, "unknown_exercise", `Unknown exercise ${item.exerciseId}`);
    }
    if (!skillSlugs.has(item.skillId)) {
      throw new HttpError(422, "unknown_skill", `Unknown skill ${item.skillId}`);
    }
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(sessions).where(eq(sessions.id, submission.id));
    if (existing && existing.userId !== userId) {
      throw new HttpError(409, "session_conflict", "This session id belongs to someone else");
    }
    const row = {
      userId,
      date: submission.date,
      seed: submission.seed,
      startedAt: submission.startedAt,
      finishedAt: submission.finishedAt,
      abandoned: submission.abandoned,
    };
    await tx
      .insert(sessions)
      .values({ id: submission.id, ...row })
      .onConflictDoUpdate({ target: sessions.id, set: row });

    await tx.delete(sessionExercises).where(eq(sessionExercises.sessionId, submission.id));
    if (submission.items.length > 0) {
      await tx.insert(sessionExercises).values(
        submission.items.map((item) => ({
          sessionId: submission.id,
          position: item.position,
          exerciseId: item.exerciseId,
          skillSlug: item.skillId,
          block: item.block,
          reason: item.reason,
          repeat: item.repeat,
        })),
      );
    }

    // Attempts uploaded before the session point at it through `attempts.session_id`; attempts that
    // arrive afterwards are linked when they are recorded. Slots are filled in finish order.
    const named = submission.items.flatMap((item) => (item.attemptId ? [item.attemptId] : []));
    const mine =
      named.length === 0
        ? []
        : await tx
            .select({ id: attempts.id, exerciseId: attempts.exerciseId })
            .from(attempts)
            .where(and(eq(attempts.userId, userId), inArray(attempts.id, named)));
    for (const item of submission.items) {
      const found = mine.find((attempt) => attempt.id === item.attemptId);
      if (found) {
        await tx
          .update(sessionExercises)
          .set({ attemptId: found.id })
          .where(
            and(
              eq(sessionExercises.sessionId, submission.id),
              eq(sessionExercises.position, item.position),
            ),
          );
        await tx
          .update(attempts)
          .set({ sessionId: submission.id })
          .where(eq(attempts.id, found.id));
      }
    }

    const waiting = await tx
      .select({ id: attempts.id, exerciseId: attempts.exerciseId })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.sessionId, submission.id)))
      .orderBy(asc(attempts.finishedAt));
    for (const attempt of waiting) {
      await linkAttemptToSession(tx, submission.id, attempt.id, attempt.exerciseId);
    }
  });

  return {
    id: submission.id,
    date: submission.date,
    startedAt: submission.startedAt,
    finishedAt: submission.finishedAt,
    abandoned: submission.abandoned,
    items: submission.items.length,
  };
}
