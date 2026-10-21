import {
  parseExerciseYaml,
  ExerciseValidationError,
  type Exercise,
  type LoadedExercise,
} from "./validate";
import { parseSkillYaml, type Skill } from "./skill";

export interface ContentSource {
  /** Where the text came from, for error messages (a path). */
  readonly path: string;
  readonly text: string;
}

export interface ContentInput {
  readonly skills: readonly ContentSource[];
  readonly exercises: readonly ContentSource[];
}

export interface ContentBundle {
  readonly skills: readonly Skill[];
  readonly exercises: readonly Exercise[];
}

export class ContentValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(
      `Invalid content (${errors.length} problem${errors.length === 1 ? "" : "s"}):\n${errors.map((error) => `  - ${error}`).join("\n")}`,
    );
    this.name = "ContentValidationError";
    this.errors = errors;
  }
}

interface Identified {
  readonly id: string;
  readonly slug: string;
  readonly source: string;
}

/** IDs and slugs are stable public identifiers: each must be unique within its kind. */
function findDuplicates(kind: string, entries: readonly Identified[]): string[] {
  const errors: string[] = [];
  for (const field of ["id", "slug"] as const) {
    const seen = new Map<string, string>();
    for (const entry of entries) {
      const first = seen.get(entry[field]);
      if (first === undefined) seen.set(entry[field], entry.source);
      else {
        errors.push(
          `duplicate ${kind} ${field} "${entry[field]}" in ${entry.source} (first defined in ${first})`,
        );
      }
    }
  }
  return errors;
}

/** Reports one prerequisite cycle per cycle found, e.g. `a -> b -> a`. A skill that lists itself is reported separately. */
function findPrerequisiteCycles(skills: readonly Skill[]): string[] {
  const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));
  const errors: string[] = [];
  const finished = new Set<string>();

  const visit = (slug: string, path: readonly string[]): void => {
    if (finished.has(slug)) return;
    const at = path.indexOf(slug);
    if (at !== -1) {
      errors.push(`prerequisite cycle: ${[...path.slice(at), slug].join(" -> ")}`);
      return;
    }
    for (const prerequisite of bySlug.get(slug)?.prerequisites ?? []) {
      if (prerequisite !== slug && bySlug.has(prerequisite)) visit(prerequisite, [...path, slug]);
    }
    finished.add(slug);
  };

  for (const skill of skills) visit(skill.slug, []);
  return errors;
}

function parseAll<T>(
  sources: readonly ContentSource[],
  parse: (text: string, path: string) => T,
  errors: string[],
): { value: T; source: string }[] {
  const parsed: { value: T; source: string }[] = [];
  for (const source of sources) {
    try {
      parsed.push({ value: parse(source.text, source.path), source: source.path });
    } catch (error) {
      errors.push(
        error instanceof ExerciseValidationError
          ? error.message
          : `${source.path}: ${String(error)}`,
      );
    }
  }
  return parsed;
}

/**
 * Parses and cross-checks all content. Reports every problem at once:
 * schema errors, duplicate ids/slugs, unknown or disabled skills, unknown
 * prerequisites, and prerequisite cycles.
 */
export function validateContent(input: ContentInput): {
  bundle: ContentBundle | null;
  errors: string[];
} {
  const errors: string[] = [];
  const skills = parseAll(input.skills, parseSkillYaml, errors);
  const exercises = parseAll(input.exercises, parseExerciseYaml, errors);

  errors.push(
    ...findDuplicates(
      "skill",
      skills.map(({ value, source }) => ({ ...value, source })),
    ),
    ...findDuplicates(
      "exercise",
      exercises.map(({ value, source }) => ({ ...value, source })),
    ),
  );

  const bySlug = new Map(skills.map(({ value }) => [value.slug, value]));

  for (const { value: skill, source } of skills) {
    for (const prerequisite of skill.prerequisites) {
      if (prerequisite === skill.slug)
        errors.push(`${source}: skill ${skill.slug} lists itself as a prerequisite`);
      else if (!bySlug.has(prerequisite)) {
        errors.push(`${source}: skill ${skill.slug} has unknown prerequisite "${prerequisite}"`);
      }
    }
  }
  errors.push(...findPrerequisiteCycles(skills.map(({ value }) => value)));

  for (const { value: exercise, source } of exercises) {
    for (const slug of exercise.skillIds) {
      const skill = bySlug.get(slug);
      if (skill === undefined)
        errors.push(`${source}: exercise ${exercise.slug} references unknown skill "${slug}"`);
      else if (!skill.enabled)
        errors.push(`${source}: exercise ${exercise.slug} references disabled skill "${slug}"`);
    }
  }

  if (errors.length > 0) return { bundle: null, errors };
  return {
    bundle: {
      skills: skills.map(({ value }) => value),
      exercises: exercises.map(({ value }) => value),
    },
    errors,
  };
}

/** Same as `validateContent`, but throws one `ContentValidationError` listing every problem. */
export function loadContent(input: ContentInput): ContentBundle {
  const { bundle, errors } = validateContent(input);
  if (bundle === null) throw new ContentValidationError(errors);
  return bundle;
}

export type { LoadedExercise };
