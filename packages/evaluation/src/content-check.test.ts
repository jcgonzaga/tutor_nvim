import { describe, expect, it } from "vitest";
import { checkExercise } from "./content-check";
import { exerciseWith } from "./test-util";

describe("checkExercise", () => {
  it("accepts an exercise whose solutions reach its objective with the declared classification", () => {
    expect(checkExercise(exerciseWith())).toEqual([]);
  });

  it("rejects a solution that does not reach the objective", () => {
    const exercise = exerciseWith({
      solutions: [
        { sequence: 'ci"production<Esc>', classification: "optimal" },
        { sequence: 'ci"prod<Esc>', classification: "valid" },
      ],
    });
    expect(checkExercise(exercise)).toEqual([
      'vim.test.basic-001: solution ci"prod<Esc> does not reach the objective',
    ]);
  });

  it("rejects a solution with keys left after the objective is reached", () => {
    const exercise = exerciseWith({
      solutions: [{ sequence: 'ci"production<Esc>ll', classification: "optimal" }],
    });
    expect(checkExercise(exercise)).toEqual([
      'vim.test.basic-001: solution ci"production<Esc>ll has 2 keys after the objective is already reached',
    ]);
  });

  it("rejects a declared classification that the evaluation disagrees with", () => {
    const exercise = exerciseWith({
      solutions: [
        { sequence: 'ci"production<Esc>', classification: "optimal" },
        { sequence: 'ci"production<Esc>', classification: "valid" },
      ],
    });
    // The same sequence declared twice with different classifications: the first match wins, so `valid` is wrong.
    expect(checkExercise(exercise)).toEqual([
      'vim.test.basic-001: solution ci"production<Esc> is declared valid but evaluates as optimal',
    ]);
  });

  it("rejects a good solution that trips an anti-pattern the exercise declares", () => {
    const exercise = exerciseWith({
      initialState: { buffer: "abcdef\n", cursor: { line: 1, column: 1 } },
      objective: { type: "buffer_equals", target: "def\n" },
      evaluation: { requireFinalNormalMode: false },
      solutions: [{ sequence: "xxx", classification: "optimal" }],
      antiPatterns: ["repeated_x"],
    });
    expect(checkExercise(exercise)).toEqual([
      "vim.test.basic-001: solution xxx is declared optimal but triggers repeated_x",
    ]);
  });

  it("allows declaring a bad habit as an anti-pattern solution", () => {
    const exercise = exerciseWith({
      initialState: { buffer: "abcdef ghi\n", cursor: { line: 1, column: 1 } },
      objective: { type: "buffer_equals", target: "ghi\n" },
      evaluation: { requireFinalNormalMode: false },
      solutions: [
        { sequence: "dw", classification: "optimal" },
        { sequence: "xxxxxxx", classification: "anti-pattern" },
      ],
      antiPatterns: ["repeated_x"],
    });
    expect(checkExercise(exercise)).toEqual([]);
  });

  it("rejects an objective that the initial state already satisfies", () => {
    const exercise = exerciseWith({
      initialState: { buffer: "same\n", cursor: { line: 1, column: 1 } },
      objective: { type: "buffer_equals", target: "same\n" },
      evaluation: { requireFinalNormalMode: false },
      solutions: [{ sequence: "l", classification: "optimal" }],
    });
    expect(checkExercise(exercise)).toContain(
      "vim.test.basic-001: the objective is already satisfied by the initial state",
    );
  });
});
