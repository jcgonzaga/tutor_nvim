import { loadContent, type Exercise } from "@tutor-nvim/exercise-schema";

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
