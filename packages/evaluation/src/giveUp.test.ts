import { describe, expect, it } from "vitest";
import { advanceAttempt, giveUpAttempt } from "./attempt";
import { evaluateAttempt } from "./evaluate";
import { exerciseWith, play } from "./test-util";

const exercise = exerciseWith();

describe("giveUpAttempt", () => {
  it("ends an unsolved attempt as a failure that still reports how long it took", () => {
    const attempt = giveUpAttempt(play(exercise, 'ci"prod', { startedAt: 100 }), 5100);
    const evaluation = evaluateAttempt(exercise, attempt);

    expect(attempt.completedAt).toBe(5100);
    expect(evaluation.success).toBe(false);
    expect(evaluation.metrics.totalDurationMs).toBe(5000);
    expect(evaluation.metrics.keystrokes).toBe(7);
  });

  it("freezes the attempt: later input is ignored", () => {
    const given = giveUpAttempt(play(exercise, "x"), 1000);
    const after = advanceAttempt(exercise, given, { key: "x", timestamp: 2000 });
    expect(after).toBe(given);
  });

  it("gives up with no input at all as a failed attempt with no first-input latency", () => {
    const evaluation = evaluateAttempt(exercise, giveUpAttempt(play(exercise, ""), 3000));
    expect(evaluation.success).toBe(false);
    expect(evaluation.metrics.firstInputLatencyMs).toBeNull();
  });

  it("does not turn a solved attempt into a failure or move its end time", () => {
    const solved = play(exercise, 'ci"production<Esc>');
    expect(giveUpAttempt(solved, 99_999)).toBe(solved);
  });
});
