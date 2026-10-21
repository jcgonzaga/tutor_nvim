import { describe, expect, it } from "vitest";
import { isVimExercise, loadContent, type Exercise } from "@tutor-nvim/exercise-schema";
import { EXERCISE_MODES } from "@tutor-nvim/exercise-schema";
import { readContentInput } from "../scripts/content-fs";

/**
 * M7 content targets (IMPLEMENTATION_PLAN section 10) as tests, so the curriculum cannot quietly
 * shrink or lose a stage, a context or a command group.
 */
const { skills, exercises } = loadContent(readContentInput());

const contextOf = (exercise: Exercise) =>
  `${exercise.metadata.language ?? "?"}/${exercise.metadata.context ?? "?"}`;
const forSkill = (slug: string) => exercises.filter((exercise) => exercise.skillIds.includes(slug));
const optimalKeys = (exercise: Exercise): string =>
  (exercise.solutions.find((s) => s.classification === "optimal")?.keys ?? []).join("");
const allKeys = (exercise: Exercise): string =>
  exercise.solutions.map((solution) => solution.keys.join("")).join(" ");

const LEARNING_MODES = ["learn", "imitate", "recall", "discriminate", "transfer"] as const;

describe("MVP content volume (M7)", () => {
  it("has about 20 skills and at least 100 exercises", () => {
    expect(skills.filter((skill) => skill.enabled).length).toBeGreaterThanOrEqual(20);
    expect(exercises.length).toBeGreaterThanOrEqual(100);
  });

  it("covers every learning stage across the curriculum, each with real volume", () => {
    for (const mode of LEARNING_MODES) {
      expect(EXERCISE_MODES).toContain(mode);
      expect(
        exercises.filter((exercise) => exercise.mode === mode).length,
        mode,
      ).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("every skill is teachable, practicable and masterable", () => {
  it.each(skills.filter((skill) => skill.enabled).map((skill) => [skill.slug] as const))(
    "%s",
    (slug) => {
      const own = forSkill(slug);
      expect(own.length, "exercises").toBeGreaterThanOrEqual(5);
      // Mastery needs a second context (M4: transfer is a different `language/context`).
      expect(new Set(own.map(contextOf)).size, "contexts").toBeGreaterThanOrEqual(3);
      expect(new Set(own.map((exercise) => exercise.mode)).size, "stages").toBeGreaterThanOrEqual(
        3,
      );
      expect(
        own.some((exercise) => exercise.mode === "transfer"),
        "has a transfer exercise",
      ).toBe(true);
    },
  );
});

describe("command coverage per content group", () => {
  const optimal = exercises.map(optimalKeys);
  const used = (pattern: string) => optimal.filter((keys) => keys.includes(pattern)).length;

  it.each([
    // A: modes and atomic movement
    ["<Esc>", 5],
    ["h", 1],
    ["j", 5],
    ["k", 1],
    ["l", 5],
    ["i", 5],
    ["a", 3],
    ["o", 3],
    // B: semantic movement
    ["w", 5],
    ["b", 2],
    ["e", 3],
    ["0", 2],
    ["^", 1],
    ["$", 5],
    ["f", 5],
    ["t", 5],
    [";", 2],
    [",", 1],
    // C: operators
    ["d", 5],
    ["c", 5],
    ["y", 5],
    ["dd", 3],
    ["yy", 3],
    ["cc", 1],
    ["cw", 5],
    // D: text objects
    ["ciw", 5],
    ["diw", 1],
    ['ci"', 5],
    ['di"', 1],
    ["ci(", 5],
    ["da(", 3],
    ["ci{", 3],
    // E: repeat and undo
    ["u", 5],
    ["<C-r>", 2],
    [".", 4],
  ] as const)("optimal solutions use %s at least %i times", (pattern, minimum) => {
    expect(used(pattern)).toBeGreaterThanOrEqual(minimum);
  });

  it("has at least five meaningful variants of the high-priority patterns", () => {
    for (const pattern of ['ci"', "ci(", "ciw", "cw", "dd", "dw"]) {
      const variants = exercises
        .filter(isVimExercise)
        .filter((exercise) => allKeys(exercise).includes(pattern));
      expect(variants.length, pattern).toBeGreaterThanOrEqual(5);
      // "Meaningful" means different situations, not copies: distinct buffers.
      const buffers = new Set(variants.map((exercise) => exercise.initialState.lines.join("\n")));
      expect(buffers.size, `${pattern} distinct buffers`).toBeGreaterThanOrEqual(5);
    }
  });

  it("practices text objects in JavaScript, TypeScript, Python, Lua, JSON and shell", () => {
    const textObjectSkills = skills
      .filter((skill) => skill.tags.includes("text-object"))
      .map((skill) => skill.slug);
    const languages = new Set(
      exercises
        .filter((exercise) => exercise.skillIds.some((id) => textObjectSkills.includes(id)))
        .map((exercise) => exercise.metadata.language),
    );
    for (const language of ["javascript", "typescript", "python", "lua", "json", "shell"]) {
      expect(languages, language).toContain(language);
    }
  });
});

describe("content quality", () => {
  it("never repeats the same situation: no two exercises share a buffer, cursor and goal", () => {
    const seen = new Map<string, string>();
    for (const exercise of exercises) {
      const key = JSON.stringify([exercise.initialState, exercise.objective, exercise.skillIds]);
      const earlier = seen.get(key);
      expect(earlier, `${exercise.slug} duplicates ${earlier}`).toBeUndefined();
      seen.set(key, exercise.slug);
    }
  });

  it("gives every exercise its own instruction, so two exercises never look like a repeat", () => {
    const seen = new Map<string, string>();
    for (const exercise of exercises) {
      const earlier = seen.get(exercise.instruction);
      expect(earlier, `${exercise.slug} repeats the instruction of ${earlier}`).toBeUndefined();
      seen.set(exercise.instruction, exercise.slug);
    }
  });

  it("gives every exercise a readable instruction and progressive hints", () => {
    for (const exercise of exercises) {
      expect(exercise.instruction.length, exercise.slug).toBeGreaterThan(10);
      expect(exercise.hints.length, `${exercise.slug} hints`).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not spoil the answer in the instruction of a recall, discriminate or transfer exercise", () => {
    // These stages test retrieval: the instruction states the goal, not the key sequence.
    for (const exercise of exercises.filter((e) =>
      ["recall", "discriminate", "transfer"].includes(e.mode),
    )) {
      const keys = optimalKeys(exercise);
      if (keys.length < 3) continue;
      expect(
        exercise.instruction.includes(keys),
        `${exercise.slug} instruction contains its keys`,
      ).toBe(false);
    }
  });

  it("keeps the instruction and the hints from containing the whole optimal sequence before the last hint", () => {
    for (const exercise of exercises) {
      const keys = optimalKeys(exercise);
      if (keys.length < 4) continue;
      const early = exercise.hints.slice(0, -1).map((hint) => hint.text);
      for (const text of early) {
        expect(text.includes(keys), `${exercise.slug} spoils the answer too early`).toBe(false);
      }
    }
  });

  it("only uses exercises whose skills are all reachable through the prerequisite graph", () => {
    const known = new Set(skills.map((skill) => skill.slug));
    for (const exercise of exercises) {
      for (const id of exercise.skillIds)
        expect(known.has(id), `${exercise.slug} -> ${id}`).toBe(true);
    }
  });
});
