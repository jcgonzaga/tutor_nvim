import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { advanceAttempt, evaluateAttempt, startAttempt } from "@tutor-nvim/evaluation";
import { parseExerciseYaml } from "@tutor-nvim/exercise-schema";
import { parseKeySequence } from "@tutor-nvim/vim-engine";

const source = fileURLToPath(
  new URL("../content/exercises/vim-ci-quotes-001.yaml", import.meta.url),
);
const exercise = parseExerciseYaml(readFileSync(source, "utf8"), "vim-ci-quotes-001.yaml");

describe("M1 vertical slice (YAML -> engine -> telemetry -> evaluation)", () => {
  it("evaluates a learner typing the optimal sequence with browser-like key events", () => {
    const startedAt = 5000;
    const keys = parseKeySequence('ci"production<Esc>');

    const attempt = keys.reduce(
      (current, key, index) =>
        advanceAttempt(exercise, current, {
          ...key,
          // First key after 320 ms of thinking, then ~80 ms between keys.
          timestamp: startedAt + 320 + index * 80,
        }),
      startAttempt(exercise, startedAt),
    );
    const evaluation = evaluateAttempt(exercise, attempt);

    expect(evaluation).toEqual({
      success: true,
      strategy: "optimal",
      metrics: {
        success: true,
        strategyScore: 100,
        efficiencyScore: 100,
        firstInputLatencyMs: 320,
        totalDurationMs: 320 + 13 * 80,
        keystrokes: 14,
      },
    });
    expect(attempt.events.every((event) => event.accepted)).toBe(true);
  });

  it("does not complete when the learner stops before leaving INSERT mode", () => {
    const attempt = parseKeySequence('ci"production').reduce(
      (current, key, index) => advanceAttempt(exercise, current, { ...key, timestamp: index }),
      startAttempt(exercise, 0),
    );
    expect(attempt.completedAt).toBeNull();
    expect(evaluateAttempt(exercise, attempt)).toMatchObject({
      success: false,
      strategy: "failed",
    });
  });
});
