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
