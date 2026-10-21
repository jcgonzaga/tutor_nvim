import { parse as parseYaml } from "yaml";
import type { z } from "zod";
import { exerciseSchema, type Exercise } from "./schema";

export class ExerciseValidationError extends Error {
  readonly issues: readonly string[];
  readonly source: string | undefined;

  constructor(issues: readonly string[], source?: string) {
    super(
      `${source ?? "exercise"} is invalid:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "ExerciseValidationError";
    this.issues = issues;
    this.source = source;
  }
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return `${path === "" ? "(root)" : path}: ${issue.message}`;
  });
}

/** Validates and normalizes one exercise. Throws `ExerciseValidationError`. */
export function parseExercise(input: unknown, source?: string): Exercise {
  const result = exerciseSchema.safeParse(input);
  if (!result.success) throw new ExerciseValidationError(formatIssues(result.error), source);
  return result.data;
}

export function parseExerciseYaml(text: string, source?: string): Exercise {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (error) {
    throw new ExerciseValidationError(
      [`YAML syntax error: ${error instanceof Error ? error.message : String(error)}`],
      source,
    );
  }
  return parseExercise(data, source);
}

export interface LoadedExercise {
  readonly exercise: Exercise;
  readonly source: string;
}

/** Collection-level checks: ids and slugs are unique public identifiers. */
export function validateExerciseCollection(entries: readonly LoadedExercise[]): string[] {
  const errors: string[] = [];
  for (const field of ["id", "slug"] as const) {
    const seen = new Map<string, string>();
    for (const { exercise, source } of entries) {
      const value = exercise[field];
      const first = seen.get(value);
      if (first === undefined) seen.set(value, source);
      else errors.push(`duplicate ${field} "${value}" in ${source} (first defined in ${first})`);
    }
  }
  return errors;
}
