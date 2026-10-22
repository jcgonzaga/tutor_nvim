import {
  SOURCE_LOCALE,
  loadContent,
  localizeBundle,
  validateLocale,
  type ContentBundle,
  type Exercise,
  type Locale,
  type Skill,
} from "@tutor-nvim/exercise-schema";

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

/**
 * The content in one language (ADR-0005). English is the source files; other languages are overlays
 * of the translatable text only, validated against the source the same way (content:validate checks
 * them in CI; here a broken overlay fails loudly instead of showing mixed languages).
 */
export interface Content {
  readonly locale: Locale;
  readonly exercises: readonly Exercise[];
  readonly skills: readonly Skill[];
  findExercise(id: string): Exercise | undefined;
  findSkill(slug: string): Skill | undefined;
  exerciseIdsForSkill(skillId: string): readonly string[];
  skillTitle(slug: string): string;
}

const overlays = {
  es: {
    skills: read(
      import.meta.glob<string>("../../../content/locales/es/skills/**/*.yaml", {
        query: "?raw",
        import: "default",
        eager: true,
      }),
    ),
    exercises: read(
      import.meta.glob<string>("../../../content/locales/es/exercises/**/*.yaml", {
        query: "?raw",
        import: "default",
        eager: true,
      }),
    ),
  },
} as const;

function buildContent(locale: Locale, source: ContentBundle): Content {
  let localized = source;
  if (locale !== SOURCE_LOCALE) {
    const { texts, errors } = validateLocale(
      locale,
      source,
      overlays[locale as keyof typeof overlays],
    );
    if (texts === null) throw new Error(`Invalid ${locale} translation:\n${errors.join("\n")}`);
    localized = localizeBundle(source, texts);
  }
  const byId = new Map(localized.exercises.map((exercise) => [exercise.id, exercise]));
  const bySlug = new Map(localized.skills.map((skill) => [skill.slug, skill]));
  return {
    locale,
    exercises: localized.exercises,
    skills: localized.skills,
    findExercise: (id) => byId.get(id),
    findSkill: (slug) => bySlug.get(slug),
    exerciseIdsForSkill: (skillId) =>
      localized.exercises
        .filter((exercise) => exercise.skillIds.includes(skillId))
        .map((exercise) => exercise.id),
    skillTitle: (slug) => bySlug.get(slug)?.title ?? slug,
  };
}

const cache = new Map<Locale, Content>();

/** Content in `locale`, built once per language. */
export function contentFor(locale: Locale): Content {
  const cached = cache.get(locale);
  if (cached) return cached;
  const built = buildContent(locale, bundle);
  cache.set(locale, built);
  return built;
}
