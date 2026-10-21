import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkContent, evaluateAttempt, simulateSolution } from "@tutor-nvim/evaluation";
import { loadContent } from "@tutor-nvim/exercise-schema";
import { bufferToText } from "@tutor-nvim/vim-engine";
import { readContentInput } from "../scripts/content-fs";

const bundle = loadContent(readContentInput());

describe("content", () => {
  it("loads and cross-validates: schemas, unique ids and slugs, skill references, prerequisites", () => {
    expect(bundle.skills.length).toBeGreaterThanOrEqual(14);
    expect(bundle.exercises.length).toBeGreaterThanOrEqual(10);
  });

  it("contains the canonical M1 exercise", () => {
    expect(bundle.exercises.map((exercise) => exercise.id)).toContain("vim-ci-quotes-001");
  });

  it("executes every declared solution against the engine and finds nothing wrong", () => {
    expect(checkContent(bundle)).toEqual([]);
  });

  describe.each(bundle.exercises.map((exercise) => [exercise.slug, exercise] as const))(
    "%s",
    (_slug, exercise) => {
      it.each(exercise.solutions.map((solution) => [solution.sequence, solution] as const))(
        "declared solution %s succeeds with its declared classification",
        (_sequence, solution) => {
          const attempt = simulateSolution(exercise, solution);
          const evaluation = evaluateAttempt(exercise, attempt);

          expect(evaluation.success).toBe(true);
          expect(evaluation.strategy).toBe(solution.classification);
          if (
            exercise.kind === "vim" &&
            attempt.kind === "vim" &&
            exercise.objective.type === "buffer_equals"
          ) {
            expect(bufferToText(attempt.state.buffer)).toBe(
              exercise.objective.targetLines.join("\n"),
            );
          }
        },
      );
    },
  );
});

describe("curriculum coverage", () => {
  it("has at least one exercise for every skill", () => {
    const covered = new Set(bundle.exercises.flatMap((exercise) => exercise.skillIds));
    const uncovered = bundle.skills
      .filter((skill) => !covered.has(skill.slug))
      .map((skill) => skill.slug);
    expect(uncovered).toEqual([]);
  });

  it("spans several skills and every goal type used so far", () => {
    const skills = new Set(bundle.exercises.flatMap((exercise) => exercise.skillIds));
    expect(skills.size).toBeGreaterThanOrEqual(8);

    const goalTypes = new Set<string>();
    const collect = (objective: (typeof bundle.exercises)[number]["objective"]): void => {
      goalTypes.add(objective.type);
      if (objective.type === "all") objective.goals.forEach(collect);
    };
    bundle.exercises.forEach((exercise) => collect(exercise.objective));
    expect([...goalTypes].sort()).toEqual([
      "all",
      "buffer_equals",
      "cursor_at",
      "cwd_equals",
      "fs_matches",
      "last_output_contains",
      "last_output_equals",
      "mode_equals",
    ]);
  });

  it("gives skills with transfer exercises more than one context", () => {
    const transfer = bundle.exercises.filter((exercise) => exercise.mode === "transfer");
    const contexts = new Set(transfer.map((exercise) => exercise.metadata.language));
    expect(transfer.length).toBeGreaterThanOrEqual(3);
    expect(contexts.size).toBeGreaterThanOrEqual(3);
    expect(transfer.every((exercise) => exercise.metadata.transferTags.length > 0)).toBe(true);
  });
});

/** Exercises are content (AGENTS.md 2.2): no application code may know a particular exercise. */
describe("no exercise-specific application code", () => {
  const webSource = fileURLToPath(new URL("../apps/web/src", import.meta.url));

  function* sources(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) yield* sources(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) yield path;
    }
  }

  it("never mentions an exercise id or slug", () => {
    const identifiers = bundle.exercises.flatMap((exercise) => [exercise.id, exercise.slug]);
    const offenders = [...sources(webSource)].flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return identifiers
        .filter((identifier) => text.includes(identifier))
        .map((id) => `${file}: ${id}`);
    });
    expect(offenders).toEqual([]);
  });
});
