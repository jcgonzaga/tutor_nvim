import { loadContent, type Exercise, type Skill } from "@tutor-nvim/exercise-schema";

/**
 * Content is data, not code: every YAML file is parsed and cross-validated at load time (schemas,
 * unique ids, skill references, prerequisites), so invalid content fails loudly instead of
 * reaching the practice UI.
 */
const read = (sources: Record<string, string>) =>
  Object.entries(sources)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, text]) => ({ path, text }));

const bundle = loadContent({
  skills: read(
    import.meta.glob<string>("../../../content/skills/**/*.yaml", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ),
  exercises: read(
    import.meta.glob<string>("../../../content/exercises/**/*.yaml", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ),
});

export const exercises: readonly Exercise[] = bundle.exercises;
export const skills: readonly Skill[] = bundle.skills;

const exerciseById = new Map(bundle.exercises.map((exercise) => [exercise.id, exercise]));
const exerciseBySlug = new Map(bundle.exercises.map((exercise) => [exercise.slug, exercise]));
const skillBySlug = new Map(bundle.skills.map((skill) => [skill.slug, skill]));

export const findExercise = (id: string): Exercise | undefined => exerciseById.get(id);
export const findExerciseBySlug = (slug: string): Exercise | undefined => exerciseBySlug.get(slug);
export const findSkill = (slug: string): Skill | undefined => skillBySlug.get(slug);

/** Exercises that train `skillId`, in catalog order. */
export const exerciseIdsForSkill = (skillId: string): readonly string[] =>
  bundle.exercises.filter((exercise) => exercise.skillIds.includes(skillId)).map((e) => e.id);

/** A skill's title for display; the slug if content has no such skill. */
export const skillTitle = (slug: string): string => skillBySlug.get(slug)?.title ?? slug;
