import { describe, expect, it } from "vitest";
import { lessonsToShow } from "./lessons";
import { createUserSkill } from "./userSkill";
import { EMPTY_LEARNER, type LearnerState, type MasteryStage } from "./types";

const learnerAt = (stages: Record<string, MasteryStage>): LearnerState => ({
  ...EMPTY_LEARNER,
  skills: Object.fromEntries(
    Object.entries(stages).map(([id, stage]) => [id, { ...createUserSkill(id), stage }]),
  ),
});

const base = {
  hasLesson: () => true,
  seen: [] as string[],
  learner: EMPTY_LEARNER,
};

describe("lessonsToShow", () => {
  it("teaches a skill the learner has never seen, in the exercise's order", () => {
    expect(lessonsToShow({ ...base, skillIds: ["b", "a"] })).toEqual(["b", "a"]);
  });

  it("teaches each skill once", () => {
    expect(lessonsToShow({ ...base, skillIds: ["a", "b"], seen: ["a"] })).toEqual(["b"]);
  });

  it("skips skills without theory", () => {
    expect(lessonsToShow({ ...base, skillIds: ["a", "b"], hasLesson: (id) => id === "b" })).toEqual(
      ["b"],
    );
  });

  it("does not re-teach what the learner already practices", () => {
    const learner = learnerAt({ a: "learning", b: "practicing", c: "mastered" });
    expect(lessonsToShow({ ...base, skillIds: ["a", "b", "c"], learner })).toEqual(["a"]);
  });
});
