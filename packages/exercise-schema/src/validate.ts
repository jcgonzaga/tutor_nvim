import { parse as parseYaml } from "yaml";
import type { z } from "zod";
import { vimExerciseSchema, type VimExercise } from "./schema";
import { shellExerciseSchema, type ShellExercise } from "./shell";

/** Any exercise: the learner practices either in the Vim simulator or in the shell simulator. */
export type Exercise = VimExercise | ShellExercise;

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
  // Content written before `kind` existed is Vim; an unknown kind is reported as such.
  const kind =
    typeof input === "object" && input !== null && "kind" in input ? (input.kind ?? "vim") : "vim";
  if (kind !== "vim" && kind !== "shell") {
    throw new ExerciseValidationError(
      [`kind: must be "vim" or "shell", got ${JSON.stringify(kind)}`],
      source,
    );
  }
  const result = (kind === "shell" ? shellExerciseSchema : vimExerciseSchema).safeParse(input);
  if (!result.success) throw new ExerciseValidationError(formatIssues(result.error), source);
  return result.data;
}

export const isVimExercise = (exercise: Exercise): exercise is VimExercise =>
  exercise.kind === "vim";
export const isShellExercise = (exercise: Exercise): exercise is ShellExercise =>
  exercise.kind === "shell";

/** For code that only handles Vim exercises (the Vim engine, its tests and its tools). */
export function parseVimExercise(input: unknown, source?: string): VimExercise {
  const exercise = parseExercise(input, source);
  if (exercise.kind !== "vim") {
    throw new ExerciseValidationError(
      [`kind: expected a Vim exercise, got "${exercise.kind}"`],
      source,
    );
  }
  return exercise;
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
