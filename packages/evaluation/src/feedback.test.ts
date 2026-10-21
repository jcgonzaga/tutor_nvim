import { describe, expect, it } from "vitest";
import { evaluateAttempt } from "./evaluate";
import { describeFeedback } from "./feedback";
import { exerciseWith, play } from "./test-util";

const exercise = exerciseWith({
  solutions: [
    { sequence: 'ci"production<Esc>', classification: "optimal" },
    { sequence: 'f"lcT"production<Esc>', classification: "inefficient" },
  ],
  hints: [{ afterMs: 1000, level: 1, text: "Think Change + Inside." }],
});

const feedbackFor = (sequence: string) => {
  const attempt = play(exercise, sequence);
  return describeFeedback(exercise, attempt, evaluateAttempt(exercise, attempt));
};

describe("describeFeedback", () => {
  it("calls an optimal, error-free, hint-free run perfect and offers no alternative", () => {
    expect(feedbackFor('ci"production<Esc>')).toEqual({
      kind: "perfect",
      yourKeys: 'ci"production<Esc>',
      betterKeys: null,
      hintsUsed: 0,
    });
  });

  it("calls a run that solved the task a different way completed, and shows the better option", () => {
    const feedback = feedbackFor('i<Esc>ci"production<Esc>');
    expect(feedback.kind).toBe("completed");
    expect(feedback.yourKeys).toBe('i<Esc>ci"production<Esc>');
    expect(feedback.betterKeys).toBe('ci"production<Esc>');
  });

  it("does not count a rejected key as perfect, even if the route was otherwise optimal", () => {
    const feedback = feedbackFor('zci"production<Esc>');
    expect(feedback.kind).toBe("completed");
  });

  it("calls an optimal route that needed hints completed, without a better option to show", () => {
    const attempt = {
      ...play(exercise, 'ci"production<Esc>'),
      hints: [{ level: 1, timestamp: 5000 }],
    };
    const feedback = describeFeedback(exercise, attempt, evaluateAttempt(exercise, attempt));
    expect(feedback).toMatchObject({ kind: "completed", hintsUsed: 1, betterKeys: null });
  });

  it("calls an unsolved attempt failed and shows one way to do it", () => {
    const feedback = feedbackFor('ci"prod');
    expect(feedback.kind).toBe("failed");
    expect(feedback.yourKeys).toBe('ci"prod');
    expect(feedback.betterKeys).toBe('ci"production<Esc>');
  });

  it("shows the shortest optimal solution when several are declared", () => {
    const several = exerciseWith({
      solutions: [
        { sequence: 'ci"production<Esc>', classification: "optimal" },
        { sequence: 'ci"prod<Esc>', classification: "optimal" },
      ],
    });
    const attempt = play(several, "x");
    expect(describeFeedback(several, attempt, evaluateAttempt(several, attempt)).betterKeys).toBe(
      'ci"prod<Esc>',
    );
  });
});
