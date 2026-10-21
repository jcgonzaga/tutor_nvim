import { describe, expect, it } from "vitest";
import { startAttempt } from "./attempt";
import { evaluateAttempt } from "./evaluate";
import { canRevealHint, hintStatus, revealHint } from "./hints";
import { exerciseWith, play } from "./test-util";

const exercise = exerciseWith({
  hints: [
    { afterMs: 4000, level: 1, text: "Think Change + Inside." },
    { afterMs: 8000, level: 2, text: "Which object represents the quote?" },
  ],
});

describe("progressive timed hints", () => {
  it("offers the first hint only after its delay, counted from when the exercise was shown", () => {
    const attempt = startAttempt(exercise, 1000);
    expect(canRevealHint(exercise, attempt, 4999)).toBe(false);
    expect(canRevealHint(exercise, attempt, 5000)).toBe(true);
    expect(hintStatus(exercise, attempt).next).toEqual({
      hint: exercise.hints[0],
      availableAt: 5000,
    });
  });

  it("ignores a request that comes too early", () => {
    const attempt = startAttempt(exercise, 0);
    expect(revealHint(exercise, attempt, 1000)).toBe(attempt);
  });

  it("reveals hints one level at a time, in order", () => {
    let attempt = startAttempt(exercise, 0);

    // Even long after both delays, a single request reveals only level 1.
    attempt = revealHint(exercise, attempt, 20_000);
    expect(hintStatus(exercise, attempt).revealed.map((hint) => hint.level)).toEqual([1]);
    expect(attempt.hints).toEqual([{ level: 1, timestamp: 20_000 }]);

    attempt = revealHint(exercise, attempt, 20_001);
    expect(hintStatus(exercise, attempt).revealed.map((hint) => hint.level)).toEqual([1, 2]);
    expect(hintStatus(exercise, attempt).next).toBeNull();
  });

  it("has nothing more to reveal once every hint was shown", () => {
    let attempt = startAttempt(exercise, 0);
    attempt = revealHint(exercise, revealHint(exercise, attempt, 20_000), 20_001);
    expect(revealHint(exercise, attempt, 30_000)).toBe(attempt);
    expect(canRevealHint(exercise, attempt, 30_000)).toBe(false);
  });

  it("does nothing for an exercise without hints", () => {
    const bare = exerciseWith();
    const attempt = startAttempt(bare, 0);
    expect(hintStatus(bare, attempt)).toEqual({ revealed: [], next: null });
    expect(revealHint(bare, attempt, 60_000)).toBe(attempt);
  });

  it("stops offering hints once the attempt is complete", () => {
    const done = play(exercise, 'ci"production<Esc>');
    expect(done.completedAt).not.toBeNull();
    expect(canRevealHint(exercise, done, 60_000)).toBe(false);
    expect(revealHint(exercise, done, 60_000)).toBe(done);
  });

  it("counts shown hints in the metrics", () => {
    const solved = {
      ...play(exercise, 'ci"production<Esc>'),
      hints: [{ level: 1, timestamp: 5000 }],
    };
    const { metrics } = evaluateAttempt(exercise, solved);
    expect(metrics.hintsUsed).toBe(1);
    expect(metrics.independenceScore).toBe(75);
  });
});
