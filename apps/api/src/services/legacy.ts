import { and, count, eq, gt, sql } from "drizzle-orm";
import type { ContentBundle } from "@tutor-nvim/exercise-schema";
import { refreshStages, type LearnerState, type UserSkill } from "@tutor-nvim/pedagogy";
import type { LegacyImport } from "@tutor-nvim/shared";
import type { Db } from "../db/client";
import { attempts, personalBests, userGamification, userSkills, users } from "../db/schema";
import { HttpError } from "../errors";
import { loadLearner, saveLearner } from "./learner";

/** The account has recorded evidence: an uploaded attempt, or a skill that was practiced. */
export async function hasProgress(db: Db, userId: string): Promise<boolean> {
  const [recorded] = await db
    .select({ n: count() })
    .from(attempts)
    .where(eq(attempts.userId, userId));
  if ((recorded?.n ?? 0) > 0) return true;
  const [practiced] = await db
    .select({ n: count() })
    .from(userSkills)
    .where(and(eq(userSkills.userId, userId), gt(userSkills.attemptCount, 0)));
  return (practiced?.n ?? 0) > 0;
}

/**
 * Accepts progress a device earned before attempts could be uploaded, once, into an account that
 * has none. It cannot be replayed, so unlike everything else it is taken as the client states it:
 * the values are range-checked by the schema, unknown skills and exercises are dropped, stages are
 * recomputed here, and the placement stays the server's own (derived from the calibration).
 * An account that already has progress refuses it: server state is authoritative (ADR-0003).
 */
export async function importLegacyProgress(
  db: Db,
  bundle: ContentBundle,
  userId: string,
  legacy: LegacyImport,
): Promise<{ skills: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${users} where ${users.id} = ${userId} for update`);
    if (await hasProgress(tx, userId)) {
      throw new HttpError(409, "account_not_empty", "This account already has progress");
    }

    const known = new Set(bundle.skills.map((skill) => skill.slug));
    const incoming: Record<string, UserSkill> = {};
    for (const [slug, skill] of Object.entries(legacy.learner.skills)) {
      if (known.has(slug)) incoming[slug] = { ...skill, skillId: slug };
    }
    const current = await loadLearner(tx, userId);
    const merged: LearnerState = {
      ...current,
      skills: { ...current.skills, ...incoming },
    };
    await saveLearner(tx, userId, refreshStages(bundle.skills, merged));

    const exerciseIds = new Set(bundle.exercises.map((exercise) => exercise.id));
    for (const [exerciseId, best] of Object.entries(legacy.personalBests)) {
      if (!exerciseIds.has(exerciseId)) continue;
      await tx
        .insert(personalBests)
        .values({ userId, exerciseId, ...best })
        .onConflictDoUpdate({
          target: [personalBests.userId, personalBests.exerciseId],
          set: best,
        });
    }
    if (legacy.gamification) {
      const baseline = {
        baselineXp: legacy.gamification.xp,
        baselineBestCombo: legacy.gamification.bestCombo,
        baselineStreak: legacy.gamification.streak,
      };
      await tx
        .insert(userGamification)
        .values({ userId, ...baseline })
        .onConflictDoUpdate({ target: userGamification.userId, set: baseline });
    }
    return { skills: Object.keys(incoming).length };
  });
}
