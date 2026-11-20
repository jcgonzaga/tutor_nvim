import { and, eq, isNull, sql } from "drizzle-orm";
import {
  advanceAttempt,
  describeFeedback,
  evaluateAttempt,
  evaluateWorkspaceGoal,
  giveUpAttempt,
  recordWorkspaceAction,
  recordWorkspaceKey,
  startAttempt,
  type Attempt,
  type AttemptEvaluation,
  type WorkspaceAttempt,
} from "@tutor-nvim/evaluation";
import {
  workspaceActionRefSchema,
  type ContentBundle,
  type Exercise,
  type WorkspaceExercise,
  type WorkspaceSolutionAction,
} from "@tutor-nvim/exercise-schema";
import {
  NO_BEST,
  computeAttemptReward,
  recordAttempt,
  updatePersonalBest,
  type PersonalBest,
  type PersonalBestMetric,
} from "@tutor-nvim/pedagogy";
import type { AttemptAction, AttemptResult, AttemptSubmission } from "@tutor-nvim/shared";
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
import { comboBefore, dayOfAttempt, dayTotals } from "./gamification";
import { loadLearner, saveLearner } from "./learner";

/** An attempt may not claim to have finished further in the future than clock skew explains. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Rebuilds the attempt from what the learner did and evaluates it with the same engine and
 * evaluation the client uses. The client's own score is never read (AGENTS 26).
 *
 * Two kinds are spent in keys and replay `events`. A workspace story is spent in steps — an action a
 * layer resolved or a key the engine took — so it replays `steps` instead, in order (T9).
 */
export function replaySubmission(
  exercise: Exercise,
  submission: AttemptSubmission,
): { attempt: Attempt; evaluation: AttemptEvaluation } {
  if (exercise.kind === "workspace") return replayWorkspaceSubmission(exercise, submission);
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

/**
 * Rebuilds a workspace attempt from the steps the browser recorded (T9).
 *
 * A step is one of two things, and both reach the same engine the practice screen drives: an action
 * goes through `recordWorkspaceAction` (`applyWorkspaceAction` underneath), a key through
 * `recordWorkspaceKey` (`dispatchWorkspace` underneath). Most stories are solved by typing, so the
 * keys are half the record: replaying only the actions would refuse a learner who really solved it.
 *
 * The wire shape is only a bound, so every action is validated here with the vocabulary's own
 * `workspaceActionRefSchema` before it reaches the engine: `file.open` with a `query`, a target on a
 * verb that takes none, or an unknown action name is a 400 naming the position, never a replay the
 * server improvised around. Actions are recorded in the shape content declares, which is what
 * `classifyStrategy` compares to the declared optimal solution, so the server grades the story with
 * the same rules the device showed. An action the engine refuses is a client bug, not a learner's
 * mistake, and stops the replay with the engine's reason; a refused key changed nothing when the
 * learner pressed it either, so the replay passes over it exactly as the device did.
 */
function replayWorkspaceSubmission(
  exercise: WorkspaceExercise,
  submission: AttemptSubmission,
): { attempt: WorkspaceAttempt; evaluation: AttemptEvaluation } {
  let attempt = startAttempt(exercise, submission.startedAt);
  for (const [index, step] of submission.steps.entries()) {
    if (step.kind === "action") {
      const action = validateWorkspaceAction(step.action, index);
      const recorded = recordWorkspaceAction(attempt, action);
      if (!recorded.applied) {
        throw new HttpError(
          422,
          "workspace_action_refused",
          `Action ${index} (${action.action}) was refused: ${recorded.reason}`,
        );
      }
      attempt = recorded.attempt;
      continue;
    }
    attempt = recordWorkspaceKey(attempt, {
      key: step.key,
      ...(step.code ? { code: step.code } : {}),
      ctrl: step.ctrl,
      alt: step.alt,
      shift: step.shift,
      meta: step.meta,
      timestamp: step.timestamp,
    }).attempt;
  }
  attempt = { ...attempt, hints: submission.hints };
  if (submission.completedAt !== null) {
    // No stream of key timestamps to measure here: the steps carry their own timestamps but the
    // attempt's duration is the one the client measured, the way event times serve the other kinds.
    attempt = { ...attempt, completedAt: submission.completedAt };
  } else if (submission.gaveUp) {
    attempt = giveUpAttempt(attempt, submission.startedAt);
  }
  const evaluation = evaluateAttempt(exercise, attempt);
  if (!evaluation.success && !submission.gaveUp) {
    // The client says the story was solved; the replay says it was not. Nothing is stored, because a
    // workspace attempt cannot be stored as a failed one the learner never declared (T9).
    const { objective } = evaluateWorkspaceGoal(exercise, attempt.state);
    throw new HttpError(
      422,
      "unsatisfied_objective",
      `The actions do not reach the objective: ${objective.failures.join("; ")}`,
    );
  }
  return { attempt, evaluation };
}

/**
 * Turns one wire action into content's action, or refuses the submission.
 *
 * The two shapes are the same fields; what differs is that `workspaceActionRefSchema` knows which
 * verb takes which field. Parsing it here means a malformed action is a 400 before any state exists.
 */
function validateWorkspaceAction(action: AttemptAction, index: number): WorkspaceSolutionAction {
  const parsed = workspaceActionRefSchema.safeParse(action);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map(
    (issue) => `${issue.path.join(".") || "action"}: ${issue.message}`,
  );
  throw new HttpError(400, "invalid_request", `steps.${index}: ${issues.join("; ")}`);
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
    xp: row.xp,
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

    // The game layer, recomputed here from the same pure functions the device uses. Only attempts
    // of a daily session earn XP and combo; the client's own figures are never read.
    const day = dayOfAttempt(submission.localDay, at);
    let xp = 0;
    let comboAfter: number | null = null;
    if (submission.sessionId) {
      const totals = await dayTotals(tx, userId, exercise.id, day);
      const reward = computeAttemptReward({
        success: evaluation.success,
        feedback: describeFeedback(exercise, attempt, evaluation).kind,
        strategy: evaluation.strategy,
        maxHintLevel: attempt.hints.reduce((highest, hint) => Math.max(highest, hint.level), 0),
        hintsUsed: metrics.hintsUsed,
        antiPatterns: evaluation.antiPatterns.length,
        scheduledReview: recorded.updates.some((update) => update.scheduledReview),
        transferEvidence: recorded.updates.some((update) => update.transferEvidence),
        personalBests: improved.length,
        priorCompletionsToday: totals.priorCompletions,
        xpToday: totals.xpToday,
        comboBefore: await comboBefore(tx, userId, submission.sessionId),
      });
      xp = reward.award.total;
      comboAfter = reward.combo.state.current;
    }

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
      startedMs: submission.startedAt,
      localDay: day,
      xp,
      comboAfter,
      improved: [...improved],
    });

    // Telemetry: one row per logical key, enough to rebuild a ghost replay (AGENTS 11). A workspace
    // attempt has none to store: its steps arrived in the submission, were replayed through the
    // workspace engine, and are not a keypress stream — half of them are actions, and the keys among
    // them only make sense in their order with the actions. The attempt row keeps the outcome and
    // `metrics.keystrokes` counts the steps it spent, so nothing here pretends a recording exists (T9).
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
      xp,
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
