import { describe, expect, it } from "vitest";
import { loadContent, localizeBundle, validateLocale } from "@tutor-nvim/exercise-schema";
import { readContentInput, readLocaleInput } from "../scripts/content-fs";

/**
 * ADR-0005: every skill teaches before it asks (a lesson) and every exercise can explain itself after
 * a poor attempt (an explanation), in both languages. The schema keeps these optional so older
 * content still loads; this is where completeness is enforced.
 */
const bundle = loadContent(readContentInput());
const { texts, errors } = validateLocale("es", bundle, readLocaleInput("es"));
const es = localizeBundle(bundle, texts!);

describe("teaching content", () => {
  it("has a complete Spanish translation", () => {
    expect(errors).toEqual([]);
  });

  describe.each(bundle.skills.map((skill) => [skill.slug, skill] as const))("%s", (slug, skill) => {
    it("has a lesson of 2 to 4 cards, one idea each", () => {
      expect(skill.lesson.length).toBeGreaterThanOrEqual(2);
      expect(skill.lesson.length).toBeLessThanOrEqual(4);
    });

    it("has a Spanish lesson that is actually translated", () => {
      const spanish = es.skills.find((candidate) => candidate.slug === slug)!;
      expect(spanish.title).not.toBe(skill.title);
      spanish.lesson.forEach((card, index) => {
        expect(card.body).not.toBe(skill.lesson[index]!.body);
        expect(card.keys).toBe(skill.lesson[index]!.keys);
      });
    });
  });

  describe.each(bundle.exercises.map((exercise) => [exercise.slug, exercise] as const))(
    "%s",
    (slug, exercise) => {
      it("has an explanation, in both languages", () => {
        expect(exercise.explanation, "English explanation").toBeTruthy();
        const spanish = es.exercises.find((candidate) => candidate.slug === slug)!;
        expect(spanish.explanation, "Spanish explanation").toBeTruthy();
        expect(spanish.explanation).not.toBe(exercise.explanation);
      });

      it("keeps what the Spanish text must not change: ids, solutions, hint timing", () => {
        const spanish = es.exercises.find((candidate) => candidate.slug === slug)!;
        expect(spanish.id).toBe(exercise.id);
        expect(spanish.solutions).toEqual(exercise.solutions);
        expect(spanish.hints.map(({ afterMs, level }) => [afterMs, level])).toEqual(
          exercise.hints.map(({ afterMs, level }) => [afterMs, level]),
        );
      });
    },
  );
});

/**
 * What the learner sees on screen is not translated: a folder is called `project` in the exercise's
 * file system, so "the project's src folder" in Spanish would send them to `cd proyecto/src`. Every
 * name from the exercise's files, and every quoted literal, that the English text mentions must
 * appear untranslated in the Spanish text of the same field.
 */
describe("names the learner sees on screen stay untranslated", () => {
  const mentions = (name: string, text: string) =>
    new RegExp(`(?<![\\w./-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(text);

  const screenNames = (exercise: (typeof bundle.exercises)[number]): string[] => {
    if (exercise.kind !== "shell") return [];
    const paths = [
      ...Object.keys(exercise.initialState.files),
      exercise.initialState.cwd,
      ...(exercise.objective.type === "cwd_equals" ? [exercise.objective.path] : []),
      ...(exercise.objective.type === "fs_matches"
        ? [...Object.keys(exercise.objective.files), ...exercise.objective.absent]
        : []),
    ];
    return [...new Set(paths.flatMap((path) => path.split("/")).filter(Boolean))];
  };

  const fields = (exercise: (typeof bundle.exercises)[number], source: boolean) => {
    const text = source ? bundle.exercises : es.exercises;
    const found = text.find((candidate) => candidate.id === exercise.id)!;
    return [
      found.instruction,
      ...found.hints.map((hint) => hint.text),
      ...(found.explanation ? [found.explanation] : []),
    ];
  };

  it.each(bundle.exercises.map((exercise) => [exercise.slug, exercise] as const))(
    "%s",
    (_slug, exercise) => {
      const english = fields(exercise, true);
      const spanish = fields(exercise, false);
      english.forEach((text, index) => {
        // Quoted values are only read in the instruction: elsewhere a quote is usually a key (ci").
        const quoted =
          index === 0
            ? [...text.matchAll(/"([^"]+)"|`([^`]+)`/g)].map((match) => match[1] ?? match[2]!)
            : [];
        const literals = [...screenNames(exercise), ...quoted];
        for (const literal of literals) {
          if (mentions(literal, text)) {
            expect(mentions(literal, spanish[index]!), `"${literal}" in ${spanish[index]}`).toBe(
              true,
            );
          }
        }
      });
    },
  );
});
