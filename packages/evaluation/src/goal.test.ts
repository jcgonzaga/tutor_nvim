import { describe, expect, it } from "vitest";
import type { VimExerciseInput } from "@tutor-nvim/exercise-schema";
import { evaluateGoal } from "./goal";
import { exerciseWith, play } from "./test-util";

const TEXT = "alpha beta\ngamma delta\n";

function navigation(objective: VimExerciseInput["objective"]) {
  return exerciseWith({
    initialState: { buffer: TEXT, cursor: { line: 1, column: 1 } },
    objective,
    evaluation: { requireFinalNormalMode: false },
    solutions: [{ sequence: "jl", classification: "optimal" }],
  });
}

describe("goal types", () => {
  it("cursor_at compares the cursor, with 1-based content positions", () => {
    const exercise = navigation({ type: "cursor_at", line: 2, column: 2 });
    expect(exercise.objective).toEqual({ type: "cursor_at", position: { line: 1, column: 1 } });
    expect(evaluateGoal(exercise, play(exercise, "jl").state).met).toBe(true);
    expect(evaluateGoal(exercise, play(exercise, "j").state).met).toBe(false);
    expect(evaluateGoal(exercise, play(exercise, "ll").state).met).toBe(false);
  });

  it("mode_equals compares the final mode", () => {
    const exercise = navigation({ type: "mode_equals", mode: "insert" });
    expect(evaluateGoal(exercise, play(exercise, "i").state).met).toBe(true);
    expect(evaluateGoal(exercise, play(exercise, "l").state).met).toBe(false);
  });

  it("all requires every sub-goal and reports each one", () => {
    const exercise = navigation({
      type: "all",
      goals: [
        { type: "cursor_at", line: 2, column: 2 },
        { type: "buffer_equals", target: "alpha beta\ngamma delta\n" },
      ],
    });
    const solved = evaluateGoal(exercise, play(exercise, "jl").state);
    expect(solved.met).toBe(true);

    const half = evaluateGoal(exercise, play(exercise, "j").state);
    expect(half.met).toBe(false);
    expect(half.objective).toEqual({
      type: "all",
      met: false,
      goals: [
        { type: "cursor_at", met: false },
        { type: "buffer_equals", met: true },
      ],
    });
  });

  it("still applies requireFinalNormalMode on top of any objective", () => {
    const exercise = exerciseWith({
      initialState: { buffer: TEXT, cursor: { line: 1, column: 1 } },
      objective: { type: "cursor_at", line: 1, column: 1 },
      evaluation: { requireFinalNormalMode: true },
      solutions: [{ sequence: "iX<Esc>", classification: "optimal" }],
    });
    const insert = play(exercise, "i");
    expect(evaluateGoal(exercise, insert.state)).toMatchObject({ met: false, modeMatches: false });
  });
});
