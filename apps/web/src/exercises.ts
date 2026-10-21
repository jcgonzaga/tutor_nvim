import {
  parseExerciseYaml,
  validateExerciseCollection,
  type Exercise,
} from "@tutor-nvim/exercise-schema";

/**
 * Exercises are content, not code: every YAML file is parsed and validated at
 * load time, so invalid content fails loudly instead of reaching the practice UI.
 */
const sources = import.meta.glob<string>("../../../content/exercises/**/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
});

const entries = Object.entries(sources)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([source, text]) => ({ source, exercise: parseExerciseYaml(text, source) }));

const collectionErrors = validateExerciseCollection(entries);
if (collectionErrors.length > 0) {
  throw new Error(`Invalid exercise content:\n${collectionErrors.join("\n")}`);
}

export const exercises: readonly Exercise[] = entries.map((entry) => entry.exercise);
