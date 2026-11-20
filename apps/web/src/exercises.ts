import {
  SOURCE_LOCALE,
  loadContent,
  localizeBundle,
  validateLocale,
  type ContentBundle,
  type ContentSource,
  type Exercise,
  type Locale,
  type LocaleInput,
  type Skill,
} from "@tutor-nvim/exercise-schema";

/**
 * Content is data, not code: every YAML file is parsed and cross-validated at load time (schemas,
 * unique ids, skill references, prerequisites), so invalid content fails loudly instead of
 * reaching the practice UI.
 *
 * `readSourceFiles` is shared with the language packs (`locales/<locale>/**`), which read their
 * files the same way: sorted by path, so a duplicate id always reports the same two files.
 */
export const readSourceFiles = (sources: Record<string, string>): readonly ContentSource[] =>
  Object.entries(sources)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, text]) => ({ path, text }));

const bundle = loadContent({
  skills: readSourceFiles(
    import.meta.glob<string>("../../../content/skills/**/*.yaml", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ),
  exercises: readSourceFiles(
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
 *
 * Which language's content is in memory is decided by `contentPacks.ts`: the source language is
 * always there, another one arrives as its own chunk (T-902).
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

/** One language's translation overlay: the `locales/<locale>/**` files, read like the source. */
export type LocaleOverlay = LocaleInput;

function buildContent(locale: Locale, source: ContentBundle, overlay: LocaleOverlay): Content {
  const { texts, errors } = validateLocale(locale, source, overlay);
  if (texts === null) throw new Error(`Invalid ${locale} translation:\n${errors.join("\n")}`);
  const localized = localizeBundle(source, texts);
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

/** The source language: no overlay, and the base every translation is checked against. */
const sourceContent: Content = {
  locale: SOURCE_LOCALE,
  exercises: bundle.exercises,
  skills: bundle.skills,
  findExercise,
  findSkill,
  exerciseIdsForSkill,
  skillTitle,
};

/** Content built from its pack and in memory now; nothing until that pack has arrived. */
const loaded = new Map<Locale, Content>();

/** Content a runtime holds without a pack; only the test runner registers this. */
const registered = new Map<Locale, Content>();

/**
 * Whether `locale` can be read now, so the screen does not have to wait for anything. The source
 * language always can: it is bundled, and it is the base every translation is built from.
 */
export function contentReady(locale: Locale): boolean {
  return locale === SOURCE_LOCALE || loaded.has(locale) || registered.has(locale);
}

/** The content to show for `locale` now: its pack if held, else the source language. */
export function contentFor(locale: Locale): Content {
  return loaded.get(locale) ?? registered.get(locale) ?? sourceContent;
}

/** Makes `content` the content for `locale` with no fetch. See `testPacks.ts`. */
export function registerContent(locale: Locale, content: Content): void {
  registered.set(locale, content);
}

/** The content in `locale`, built from its overlay; remembered, so it is built once. */
export function localizedContent(locale: Locale, overlay: LocaleOverlay): Content {
  const built = buildContent(locale, bundle, overlay);
  loaded.set(locale, built);
  return built;
}
