import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  advanceAttempt,
  canRevealHint,
  evaluateAttempt,
  hintStatus,
  revealHint,
  startAttempt,
} from "@tutor-nvim/evaluation";
import { loadContent, parseExerciseYaml } from "@tutor-nvim/exercise-schema";
import { parseKeySequence } from "@tutor-nvim/vim-engine";

import { readContentInput } from "../scripts/content-fs";

const bundle = loadContent(readContentInput());
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
      antiPatterns: [],
      metrics: {
        success: true,
        accuracyScore: 100,
        strategyScore: 100,
        efficiencyScore: 100,
        // 320 ms to start and 80 ms between keys: well inside the ideal fluency bands.
        fluencyScore: 100,
        independenceScore: 100,
        performanceScore: 100,
        firstInputLatencyMs: 320,
        medianInterKeyLatencyMs: 80,
        maxInterKeyLatencyMs: 80,
        totalDurationMs: 320 + 13 * 80,
        keystrokes: 14,
        unnecessaryKeystrokes: 0,
        errors: 0,
        hintsUsed: 0,
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

describe("M3 flows over the real content (exercise -> attempt -> evaluation)", () => {
  const bundleExercise = (slug: string) => {
    const found = bundle.exercises.find((candidate) => candidate.slug === slug);
    if (!found) throw new Error(`missing exercise ${slug}`);
    return found;
  };

  const run = (slug: string, sequence: string, step = 100) => {
    const target = bundleExercise(slug);
    const attempt = parseKeySequence(sequence).reduce(
      (current, key, index) =>
        advanceAttempt(target, current, { ...key, timestamp: (index + 1) * step }),
      startAttempt(target, 0),
    );
    return { exercise: target, attempt, evaluation: evaluateAttempt(target, attempt) };
  };

  it("solving by pressing x repeatedly succeeds but is classified as an anti-pattern", () => {
    const { evaluation } = run("vim.delete.word-001", "xxxxx");
    expect(evaluation.success).toBe(true);
    expect(evaluation.strategy).toBe("anti-pattern");
    expect(evaluation.antiPatterns.map((hit) => hit.id)).toEqual(["repeated_x"]);
    expect(evaluation.metrics.performanceScore).toBeLessThan(
      run("vim.delete.word-001", "dw").evaluation.metrics.performanceScore,
    );
  });

  it("arrow keys are recorded, rejected by the engine, and reported", () => {
    const { attempt, evaluation } = run("vim.navigation-atomic.basic-001", "<Down><Down>jjlll");
    expect(attempt.events.slice(0, 2).map((event) => [event.logicalKey, event.accepted])).toEqual([
      ["<Down>", false],
      ["<Down>", false],
    ]);
    expect(evaluation.success).toBe(true);
    expect(evaluation.antiPatterns.map((hit) => hit.id)).toEqual(["arrow_keys"]);
    expect(evaluation.metrics.errors).toBe(2);
  });

  it("an exercise can start with history to undo or redo, without that history being part of the attempt", () => {
    const undo = run("vim.undo.basic-001", "u");
    expect(undo.attempt.initialState.undoStack).toHaveLength(2);
    expect(undo.attempt.events).toHaveLength(1);
    expect(undo.evaluation).toMatchObject({ success: true, strategy: "optimal" });

    const redo = run("vim.undo.redo-001", "<C-r>");
    expect(redo.attempt.initialState.redoStack).toHaveLength(2);
    expect(redo.evaluation).toMatchObject({ success: true, strategy: "optimal" });
  });

  it("a compound goal needs every part", () => {
    expect(run("vim.delete.to-end-001", "d$0").evaluation.success).toBe(true);
    expect(run("vim.delete.to-end-001", "d$").evaluation.success).toBe(false);
  });

  it("transfers the same skill to other languages with the same optimal keystrokes", () => {
    for (const slug of [
      "vim.ci-quotes.python-001",
      "vim.ci-quotes.lua-001",
      "vim.ci-quotes.json-001",
    ]) {
      const target = bundleExercise(slug);
      const optimal = target.solutions.find((solution) => solution.classification === "optimal");
      expect(optimal?.sequence.startsWith('ci"')).toBe(true);
    }
  });

  it("hints are revealed progressively and lower the independence score", () => {
    const target = bundleExercise("vim.change.word-001");
    let attempt = startAttempt(target, 0);
    expect(canRevealHint(target, attempt, 3999)).toBe(false);

    attempt = revealHint(target, attempt, 4000);
    attempt = revealHint(target, attempt, 8000);
    expect(hintStatus(target, attempt).revealed).toHaveLength(2);

    const solved = parseKeySequence("cwdone<Esc>").reduce(
      (current, key, index) =>
        advanceAttempt(target, current, { ...key, timestamp: 9000 + index * 100 }),
      attempt,
    );
    const { metrics } = evaluateAttempt(target, solved);
    expect(metrics.hintsUsed).toBe(2);
    expect(metrics.independenceScore).toBe(50);
  });
});
