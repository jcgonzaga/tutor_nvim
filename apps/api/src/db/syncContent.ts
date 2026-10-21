import { sql } from "drizzle-orm";
import type { ContentBundle } from "@tutor-nvim/exercise-schema";
import type { Db } from "./client";
import { exerciseSkills, exercises, skillPrerequisites, skills } from "./schema";

/**
 * Mirrors the validated YAML content into the database so attempts and progress have foreign keys.
 * Idempotent: safe to run on every start. The YAML remains the source of truth; content that was
 * removed from it is left in place (history may still reference it) and only ever added or updated.
 */
export async function syncContent(db: Db, bundle: ContentBundle): Promise<void> {
  await db.transaction(async (tx) => {
    for (const skill of bundle.skills) {
      const row = {
        id: skill.id,
        slug: skill.slug,
        title: skill.title,
        description: skill.description,
        domain: skill.domain,
        tier: skill.tier,
        difficulty: skill.difficulty,
        enabled: skill.enabled,
      };
      await tx
        .insert(skills)
        .values(row)
        .onConflictDoUpdate({ target: skills.id, set: { ...row, id: sql`excluded.id` } });
    }
    for (const skill of bundle.skills) {
      for (const prerequisite of skill.prerequisites) {
        await tx
          .insert(skillPrerequisites)
          .values({ skillSlug: skill.slug, prerequisiteSlug: prerequisite })
          .onConflictDoNothing();
      }
    }
    for (const exercise of bundle.exercises) {
      const row = {
        id: exercise.id,
        slug: exercise.slug,
        title: exercise.title,
        schemaVersion: exercise.schemaVersion,
        mode: exercise.mode,
        difficulty: exercise.difficulty,
      };
      await tx.insert(exercises).values(row).onConflictDoUpdate({ target: exercises.id, set: row });
      for (const skillSlug of exercise.skillIds) {
        await tx
          .insert(exerciseSkills)
          .values({ exerciseId: exercise.id, skillSlug })
          .onConflictDoNothing();
      }
    }
  });
}
