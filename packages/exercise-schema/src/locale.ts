import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { ContentBundle, ContentSource } from "./content";
import { explanationSchema, idSchema, lessonCardSchema } from "./primitives";
import { formatIssues } from "./validate";

/** Languages the interface and the content text exist in. English is the source language. */
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const SOURCE_LOCALE: Locale = "en";
export const DEFAULT_LOCALE: Locale = "es";

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/**
 * A translation overlay holds only the translatable text of a skill or an exercise, keyed by id.
 * Ids, slugs, buffers, solutions and key sequences stay in the source files (ADR-0005).
 */
export const skillTextSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  lesson: z
    .array(lessonCardSchema.omit({ keys: true }))
    .max(4)
    .default([]),
});

export const exerciseTextSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(1),
  /** Falls back to the title, as in the source file. */
  instruction: z.string().min(1).optional(),
  /** One text per hint of the source exercise, in order. */
  hints: z.array(z.string().min(1)).default([]),
  explanation: explanationSchema.optional(),
});

export type SkillText = z.output<typeof skillTextSchema>;
export type ExerciseText = z.output<typeof exerciseTextSchema>;

export interface LocaleTexts {
  readonly skills: ReadonlyMap<string, SkillText>;
  readonly exercises: ReadonlyMap<string, ExerciseText>;
}

export interface LocaleInput {
  readonly skills: readonly ContentSource[];
  readonly exercises: readonly ContentSource[];
}

function parseOverlays<T extends { id: string }>(
  kind: string,
  sources: readonly ContentSource[],
  schema: z.ZodType<T>,
  errors: string[],
): Map<string, T> {
  const byId = new Map<string, { value: T; source: string }>();
  for (const source of sources) {
    let data: unknown;
    try {
      data = parseYaml(source.text);
    } catch (error) {
      errors.push(
        `${source.path}: YAML syntax error: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      errors.push(`${source.path} is invalid:\n  - ${formatIssues(result.error).join("\n  - ")}`);
      continue;
    }
    const first = byId.get(result.data.id);
    if (first) {
      errors.push(
        `duplicate ${kind} translation "${result.data.id}" in ${source.path} (first in ${first.source})`,
      );
    } else byId.set(result.data.id, { value: result.data, source: source.path });
  }
  return new Map([...byId].map(([id, entry]) => [id, entry.value]));
}

/**
 * Parses a language's overlays and checks them against the source content: every skill and exercise
 * has a translation, none is orphaned, hints and lesson cards line up one to one, and a source
 * explanation has its translation. Reports every problem at once.
 */
export function validateLocale(
  locale: Locale,
  bundle: ContentBundle,
  input: LocaleInput,
): { texts: LocaleTexts | null; errors: string[] } {
  const errors: string[] = [];
  const skills = parseOverlays("skill", input.skills, skillTextSchema, errors);
  const exercises = parseOverlays("exercise", input.exercises, exerciseTextSchema, errors);
  const where = `[${locale}]`;

  const skillIds = new Set(bundle.skills.map((skill) => skill.id));
  for (const id of skills.keys()) {
    if (!skillIds.has(id)) errors.push(`${where} translation for unknown skill id "${id}"`);
  }
  for (const skill of bundle.skills) {
    const text = skills.get(skill.id);
    if (text === undefined) {
      errors.push(`${where} skill "${skill.slug}" (${skill.id}) has no translation`);
      continue;
    }
    if (text.lesson.length !== skill.lesson.length) {
      errors.push(
        `${where} skill "${skill.slug}": ${text.lesson.length} lesson cards, the source has ${skill.lesson.length}`,
      );
    }
  }

  const exerciseIds = new Set(bundle.exercises.map((exercise) => exercise.id));
  for (const id of exercises.keys()) {
    if (!exerciseIds.has(id)) errors.push(`${where} translation for unknown exercise id "${id}"`);
  }
  for (const exercise of bundle.exercises) {
    const text = exercises.get(exercise.id);
    if (text === undefined) {
      errors.push(`${where} exercise "${exercise.slug}" (${exercise.id}) has no translation`);
      continue;
    }
    if (text.hints.length !== exercise.hints.length) {
      errors.push(
        `${where} exercise "${exercise.slug}": ${text.hints.length} hints, the source has ${exercise.hints.length}`,
      );
    }
    if (exercise.explanation !== undefined && text.explanation === undefined) {
      errors.push(
        `${where} exercise "${exercise.slug}" has an explanation but no translation of it`,
      );
    }
  }

  return errors.length > 0 ? { texts: null, errors } : { texts: { skills, exercises }, errors };
}

/** The bundle with every translatable text replaced; everything else is shared with the source. */
export function localizeBundle(bundle: ContentBundle, texts: LocaleTexts): ContentBundle {
  return {
    skills: bundle.skills.map((skill) => {
      const text = texts.skills.get(skill.id);
      if (!text) return skill;
      return {
        ...skill,
        title: text.title,
        description: text.description,
        lesson: skill.lesson.map((card, index) => ({
          ...card,
          title: text.lesson[index]?.title ?? card.title,
          body: text.lesson[index]?.body ?? card.body,
        })),
      };
    }),
    exercises: bundle.exercises.map((exercise) => {
      const text = texts.exercises.get(exercise.id);
      if (!text) return exercise;
      return {
        ...exercise,
        title: text.title,
        instruction: text.instruction ?? text.title,
        hints: exercise.hints.map((hint, index) => ({
          ...hint,
          text: text.hints[index] ?? hint.text,
        })),
        ...(exercise.explanation !== undefined
          ? { explanation: text.explanation ?? exercise.explanation }
          : {}),
      };
    }),
  };
}
