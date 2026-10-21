import { describe, expect, it } from "vitest";
import { parseExercise, type Exercise, type ExerciseInput } from "@tutor-nvim/exercise-schema";
import { bufferToText, parseKeySequence } from "@tutor-nvim/vim-engine";
import {
  advanceAttempt,
  evaluateAttempt,
  evaluateGoal,
  simulateSolution,
  startAttempt,
  type Attempt,
} from "./index";

function exerciseWith(overrides: Partial<ExerciseInput> = {}): Exercise {
  return parseExercise({
    schemaVersion: 1,
    id: "vim-ci-quotes-001",
    slug: "vim.ci-quotes.basic-001",
    title: "Change inside quotes",
    skillIds: ["vim.operator.change", "vim.textobject.inner-quotes"],
    mode: "recall",
    difficulty: 2,
    initialState: {
      buffer: 'const mode = "development";\n',
      cursor: { line: 1, column: 18 },
      vimMode: "normal",
    },
    objective: { type: "buffer_equals", target: 'const mode = "production";\n' },
    evaluation: { requireFinalNormalMode: true },
    solutions: [{ sequence: 'ci"production<Esc>', classification: "optimal" }],
    ...overrides,
  });
}

/** Plays `sequence`; timestamps default to 10 ms apart, or are given explicitly (one per key). */
function play(
  exercise: Exercise,
  startedAt: number,
  sequence: string,
  timestamps?: number[],
): Attempt {
  const keys = parseKeySequence(sequence);
  if (timestamps) expect(timestamps).toHaveLength(keys.length);
  return keys.reduce(
    (attempt, key, index) =>
      advanceAttempt(exercise, attempt, {
        ...key,
        timestamp: timestamps?.[index] ?? startedAt + (index + 1) * 10,
      }),
    startAttempt(exercise, startedAt),
  );
}

const exercise = exerciseWith();
const OPTIMAL = 'ci"production<Esc>';
const OPTIMAL_LENGTH = 14;

describe("goal evaluation", () => {
  it("is met only when the buffer matches and the final mode is NORMAL", () => {
    const beforeEscape = play(exercise, 0, 'ci"production');
    expect(bufferToText(beforeEscape.state.buffer)).toBe('const mode = "production";');
    expect(evaluateGoal(exercise, beforeEscape.state)).toEqual({
      met: false,
      bufferMatches: true,
      modeMatches: false,
    });

    const done = simulateSolution(exercise, exercise.solutions[0]!);
    expect(evaluateGoal(exercise, done.state)).toEqual({
      met: true,
      bufferMatches: true,
      modeMatches: true,
    });
  });

  it("does not constrain the mode unless the exercise asks", () => {
    const relaxed = exerciseWith({ evaluation: { requireFinalNormalMode: false } });
    const attempt = play(relaxed, 0, 'ci"production');
    expect(evaluateGoal(relaxed, attempt.state)).toEqual({
      met: true,
      bufferMatches: true,
      modeMatches: null,
    });
    expect(attempt.completedAt).toBe(130);
  });

  it("is not met when the buffer differs", () => {
    const wrong = play(exercise, 0, 'ci"prod<Esc>');
    expect(evaluateGoal(exercise, wrong.state).met).toBe(false);
    expect(wrong.completedAt).toBeNull();
  });
});

describe("canonical exercise", () => {
  it("reaches its target when the declared solution is executed", () => {
    const attempt = simulateSolution(exercise, exercise.solutions[0]!);
    expect(bufferToText(attempt.state.buffer)).toBe('const mode = "production";');
    expect(attempt.state.mode).toBe("normal");
    expect(attempt.completedAt).not.toBeNull();
  });
});

describe("telemetry", () => {
  it("logs every input with key, code, mode and cursor before/after", () => {
    const attempt = advanceAttempt(exercise, startAttempt(exercise, 1000), {
      key: "i",
      code: "KeyI",
      timestamp: 1200,
    });
    const [event] = attempt.events;
    expect(event).toEqual({
      sequence: 0,
      timestamp: 1200,
      key: "i",
      code: "KeyI",
      logicalKey: "i",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      mode: "normal",
      cursorBefore: { line: 0, column: 17 },
      cursorAfter: { line: 0, column: 17 },
      accepted: true,
    });
  });

  it("keeps both the logical key and the physical code, per layout", () => {
    const us = { key: '"', code: "Quote", shift: true, timestamp: 1 };
    const es = { key: '"', code: "Digit2", shift: true, timestamp: 1 };
    const afterCI = play(exercise, 0, "ci");
    const usEvent = advanceAttempt(exercise, afterCI, us).events[2];
    const esEvent = advanceAttempt(exercise, afterCI, es).events[2];
    expect([usEvent?.logicalKey, usEvent?.code]).toEqual(['"', "Quote"]);
    expect([esEvent?.logicalKey, esEvent?.code]).toEqual(['"', "Digit2"]);
  });

  it("records rejected inputs as not accepted, including keys the engine does not run", () => {
    const attempt = advanceAttempt(exercise, startAttempt(exercise, 0), {
      key: "ArrowLeft",
      code: "ArrowLeft",
      timestamp: 5,
    });
    expect(attempt.events).toHaveLength(1);
    expect(attempt.events[0]).toMatchObject({ logicalKey: "<Left>", accepted: false });
    expect(attempt.state).toEqual(attempt.initialState);
  });

  it("produces ordered events sufficient to replay the attempt", () => {
    const attempt = simulateSolution(exercise, exercise.solutions[0]!);
    expect(attempt.events.map((event) => event.sequence)).toEqual(
      Array.from({ length: OPTIMAL_LENGTH }, (_, i) => i),
    );

    const replayed = attempt.events.reduce(
      (replay, event) =>
        advanceAttempt(exercise, replay, {
          key: event.key,
          ...(event.code === null ? {} : { code: event.code }),
          ctrl: event.ctrl,
          alt: event.alt,
          shift: event.shift,
          meta: event.meta,
          timestamp: event.timestamp,
        }),
      startAttempt(exercise, 0),
    );
    expect(replayed).toEqual(attempt);
  });

  it("freezes a completed attempt", () => {
    const done = simulateSolution(exercise, exercise.solutions[0]!);
    const after = advanceAttempt(exercise, done, { key: "x", timestamp: 99999 });
    expect(after).toBe(done);
  });
});

describe("strategy classification", () => {
  it("classifies the declared optimal sequence as optimal", () => {
    const attempt = simulateSolution(exercise, exercise.solutions[0]!);
    const evaluation = evaluateAttempt(exercise, attempt);
    expect(evaluation.success).toBe(true);
    expect(evaluation.strategy).toBe("optimal");
  });

  it("keeps success separate from strategy: another route to the goal is only valid", () => {
    // Same result, but with a pointless INSERT round trip first.
    const detour = play(exercise, 0, 'i<Esc>ci"production<Esc>');
    const evaluation = evaluateAttempt(exercise, detour);
    expect(evaluation.success).toBe(true);
    expect(evaluation.strategy).toBe("valid");
  });

  it("uses the classification declared for the matched solution", () => {
    const multi = exerciseWith({
      solutions: [
        { sequence: 'ci"production<Esc>', classification: "optimal" },
        { sequence: 'f"lcT"production<Esc>', classification: "inefficient" },
      ],
    });
    const attempt = simulateSolution(multi, multi.solutions[0]!);
    expect(evaluateAttempt(multi, attempt).strategy).toBe("optimal");
  });

  it("reports failed when the goal is not met", () => {
    const attempt = play(exercise, 0, "i");
    const evaluation = evaluateAttempt(exercise, attempt);
    expect(evaluation.success).toBe(false);
    expect(evaluation.strategy).toBe("failed");
    expect(evaluation.metrics.efficiencyScore).toBe(0);
    expect(evaluation.metrics.strategyScore).toBe(0);
  });
});

describe("metrics", () => {
  it("is deterministic for fixed timestamps", () => {
    const timestamps = [
      1250,
      1300,
      1340,
      ...Array.from({ length: 10 }, (_, i) => 1400 + i * 50),
      2050,
    ];
    const attempt = play(exercise, 1000, OPTIMAL, timestamps);
    const { metrics } = evaluateAttempt(exercise, attempt);

    expect(metrics).toEqual({
      success: true,
      strategyScore: 100,
      efficiencyScore: 100,
      firstInputLatencyMs: 250,
      totalDurationMs: 1050,
      keystrokes: 14,
    });
    expect(evaluateAttempt(exercise, attempt)).toEqual(evaluateAttempt(exercise, attempt));
  });

  it("scales efficiency by the shortest optimal solution", () => {
    // 14 optimal keys vs 28 used (the extra 14 are rejected, unsupported inputs).
    const padded = `${"z".repeat(14)}${OPTIMAL}`;
    const attempt = play(exercise, 0, padded);
    const { metrics, strategy } = evaluateAttempt(exercise, attempt);
    expect(metrics.keystrokes).toBe(28);
    expect(metrics.efficiencyScore).toBe(50);
    expect(strategy).toBe("valid");
    expect(metrics.strategyScore).toBe(70);
  });

  it("reports no latency when nothing was typed", () => {
    const { metrics } = evaluateAttempt(exercise, startAttempt(exercise, 500));
    expect(metrics).toMatchObject({ firstInputLatencyMs: null, totalDurationMs: 0, keystrokes: 0 });
  });

  it("takes weights from configuration", () => {
    const attempt = simulateSolution(exercise, exercise.solutions[0]!);
    const { metrics } = evaluateAttempt(exercise, attempt, {
      strategyScores: {
        optimal: 42,
        efficient: 0,
        valid: 0,
        inefficient: 0,
        "anti-pattern": 0,
        failed: 0,
      },
    });
    expect(metrics.strategyScore).toBe(42);
  });
});
