import { and, eq, inArray } from "drizzle-orm";
import {
  createUserSkill,
  type LearnerState,
  type ReviewState,
  type UserSkill,
} from "@tutor-nvim/pedagogy";
import { MASTERY_STAGES } from "@tutor-nvim/pedagogy";
import type { Db } from "../db/client";
import { reviewQueue, userSettings, userSkills } from "../db/schema";

type SkillRow = typeof userSkills.$inferSelect;

function toUserSkill(row: SkillRow): UserSkill {
  const stage = MASTERY_STAGES.find((candidate) => candidate === row.stage) ?? "learning";
  return {
    ...createUserSkill(row.skillSlug),
    skillId: row.skillSlug,
    stage,
    mastery: row.mastery,
    accuracy: row.accuracy,
    strategy: row.strategy,
    fluency: row.fluency,
    retention: row.retention,
    transfer: row.transfer,
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt,
    nextReviewAt: row.nextReviewAt,
    review: (row.review as ReviewState | null) ?? null,
    delayedRecallCount: row.delayedRecallCount,
    transferCount: row.transferCount,
    seenContexts: row.seenContexts,
  };
}

/** The persisted `LearnerState`: one row per skill, plus the calibration placement. */
export async function loadLearner(db: Db, userId: string): Promise<LearnerState> {
  const rows = await db.select().from(userSkills).where(eq(userSkills.userId, userId));
  const [settings] = await db
    .select({ placed: userSettings.placed })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  const placed = settings?.placed ?? [];
  const skills = Object.fromEntries(rows.map((row) => [row.skillSlug, toUserSkill(row)]));
  return placed.length > 0 ? { skills, placed } : { skills };
}

/**
 * Writes the learner state back and keeps `review_queue` in step with each skill's review date.
 * Call it inside a transaction together with whatever produced the new state.
 */
export async function saveLearner(db: Db, userId: string, learner: LearnerState): Promise<void> {
  const entries = Object.values(learner.skills);
  for (const skill of entries) {
    const row = {
      userId,
      skillSlug: skill.skillId,
      stage: skill.stage,
      mastery: skill.mastery,
      accuracy: skill.accuracy,
      strategy: skill.strategy,
      fluency: skill.fluency,
      retention: skill.retention,
      transfer: skill.transfer,
      attemptCount: skill.attemptCount,
      lastAttemptAt: skill.lastAttemptAt,
      nextReviewAt: skill.nextReviewAt,
      review: skill.review,
      delayedRecallCount: skill.delayedRecallCount,
      transferCount: skill.transferCount,
      seenContexts: [...skill.seenContexts],
      updatedAt: new Date(),
    };
    await db
      .insert(userSkills)
      .values(row)
      .onConflictDoUpdate({ target: [userSkills.userId, userSkills.skillSlug], set: row });

    if (skill.review !== null && skill.nextReviewAt !== null) {
      const queued = {
        userId,
        skillSlug: skill.skillId,
        dueAt: skill.nextReviewAt,
        stability: skill.review.stability,
      };
      await db
        .insert(reviewQueue)
        .values(queued)
        .onConflictDoUpdate({ target: [reviewQueue.userId, reviewQueue.skillSlug], set: queued });
    } else {
      await db
        .delete(reviewQueue)
        .where(
          and(eq(reviewQueue.userId, userId), inArray(reviewQueue.skillSlug, [skill.skillId])),
        );
    }
  }
}
