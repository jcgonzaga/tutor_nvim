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
  // One multi-row statement per table, not one per item: this runs on every cold start, and over
  // the network (Neon, possibly another region) a statement per exercise made boot take minutes.
  const skillRows = bundle.skills.map((skill) => ({
    id: skill.id,
    slug: skill.slug,
    title: skill.title,
    description: skill.description,
    domain: skill.domain,
    tier: skill.tier,
    difficulty: skill.difficulty,
    enabled: skill.enabled,
  }));
  const prerequisiteRows = bundle.skills.flatMap((skill) =>
    skill.prerequisites.map((prerequisite) => ({
      skillSlug: skill.slug,
      prerequisiteSlug: prerequisite,
    })),
  );
  const exerciseRows = bundle.exercises.map((exercise) => ({
    id: exercise.id,
    slug: exercise.slug,
    title: exercise.title,
    schemaVersion: exercise.schemaVersion,
    mode: exercise.mode,
    difficulty: exercise.difficulty,
  }));
  const exerciseSkillRows = bundle.exercises.flatMap((exercise) =>
    exercise.skillIds.map((skillSlug) => ({ exerciseId: exercise.id, skillSlug })),
  );

  await db.transaction(async (tx) => {
    if (skillRows.length > 0) {
      await tx
        .insert(skills)
        .values(skillRows)
        .onConflictDoUpdate({
          target: skills.id,
          set: {
            slug: sql`excluded.slug`,
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            domain: sql`excluded.domain`,
            tier: sql`excluded.tier`,
            difficulty: sql`excluded.difficulty`,
            enabled: sql`excluded.enabled`,
          },
        });
    }
    if (prerequisiteRows.length > 0) {
      await tx.insert(skillPrerequisites).values(prerequisiteRows).onConflictDoNothing();
    }
    if (exerciseRows.length > 0) {
      await tx
        .insert(exercises)
        .values(exerciseRows)
        .onConflictDoUpdate({
          target: exercises.id,
          set: {
            slug: sql`excluded.slug`,
            title: sql`excluded.title`,
            schemaVersion: sql`excluded.schema_version`,
            mode: sql`excluded.mode`,
            difficulty: sql`excluded.difficulty`,
          },
        });
    }
    if (exerciseSkillRows.length > 0) {
      await tx.insert(exerciseSkills).values(exerciseSkillRows).onConflictDoNothing();
    }
  });
}
