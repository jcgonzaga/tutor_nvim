/**
 * `pnpm content:validate` - schema-validates every exercise under content/exercises
 * and checks collection-level identity rules. Exits non-zero on any problem.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ExerciseValidationError,
  parseExerciseYaml,
  validateExerciseCollection,
  type LoadedExercise,
} from "@tutor-nvim/exercise-schema";

const root = fileURLToPath(new URL("..", import.meta.url));
const exercisesDir = join(root, "content", "exercises");

function* yamlFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* yamlFiles(path);
    else if (/\.ya?ml$/.test(entry.name)) yield path;
  }
}

const loaded: LoadedExercise[] = [];
const errors: string[] = [];

for (const file of [...yamlFiles(exercisesDir)].sort()) {
  const source = relative(root, file);
  try {
    loaded.push({ exercise: parseExerciseYaml(readFileSync(file, "utf8"), source), source });
  } catch (error) {
    errors.push(
      error instanceof ExerciseValidationError ? error.message : `${source}: ${String(error)}`,
    );
  }
}
errors.push(...validateExerciseCollection(loaded));

if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(
    `\ncontent:validate failed (${errors.length} problem${errors.length === 1 ? "" : "s"})`,
  );
  process.exit(1);
}
console.log(
  `content:validate OK - ${loaded.length} exercise${loaded.length === 1 ? "" : "s"} valid`,
);
