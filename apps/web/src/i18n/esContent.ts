import { readSourceFiles, type LocaleOverlay } from "../exercises";

/**
 * The Spanish content overlay (ADR-0005): the translated skill and exercise text of
 * `content/locales/es/**`.
 *
 * Only a learner who reads Spanish ever fetches this module. It is reached through the dynamic
 * import in `contentPacks.ts`; the globs are eager *inside it*, so the whole overlay is one asset of
 * its own (the bundler names the chunk after this file, `esContent-<hash>.js`) while the English
 * source content stays in the entry as the synchronous base and the fallback.
 *
 * Nothing imports this statically: not even the test runner, whose packs come in through a dynamic
 * import of their own (see `testPacks.ts`). A static import here would ship the overlay in the entry
 * chunk again, and `tests/perf` fails if it does.
 */
export const esOverlay: LocaleOverlay = {
  skills: readSourceFiles(
    import.meta.glob<string>("../../../../content/locales/es/skills/**/*.yaml", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ),
  exercises: readSourceFiles(
    import.meta.glob<string>("../../../../content/locales/es/exercises/**/*.yaml", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ),
};
