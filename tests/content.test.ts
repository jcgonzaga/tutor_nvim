import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateAttempt, simulateSolution } from "@tutor-nvim/evaluation";
import { parseExerciseYaml } from "@tutor-nvim/exercise-schema";
import { bufferToText } from "@tutor-nvim/vim-engine";

const exercisesDir = fileURLToPath(new URL("../content/exercises", import.meta.url));
const files = readdirSync(exercisesDir).filter((name) => /\.ya?ml$/.test(name));

describe("content/exercises", () => {
  it("contains the canonical M1 exercise", () => {
    expect(files).toContain("vim-ci-quotes-001.yaml");
  });

  describe.each(files)("%s", (file) => {
    const exercise = parseExerciseYaml(readFileSync(join(exercisesDir, file), "utf8"), file);

    it.each(exercise.solutions.map((solution) => [solution.sequence, solution] as const))(
      "declared solution %s reaches the target with its declared classification",
      (_sequence, solution) => {
        const attempt = simulateSolution(exercise, solution);
        const evaluation = evaluateAttempt(exercise, attempt);

        expect(bufferToText(attempt.state.buffer)).toBe(exercise.objective.targetLines.join("\n"));
        expect(evaluation.success).toBe(true);
        expect(evaluation.strategy).toBe(solution.classification);
      },
    );
  });
});
