import { describe, expect, it } from "vitest";
import { scoreExercise, isExerciseAvailable, type PriorityContext } from "./priority";
import { resolveStages } from "./unlock";
import { EMPTY_LEARNER, type AttemptRecord, type LearnerState } from "./types";
import { CONFIG, DAY_MS, FAILED, PERFECT, T0, exerciseFor, replay, skillOf } from "./test-util";

const skills = [
  skillOf("vim.a"),
  skillOf("vim.b", ["vim.a"], 2),
  skillOf("vim.c", ["vim.a"], 2),
  skillOf("vim.d", ["vim.a"], 2),
];
const exA = exerciseFor("ex-a", ["vim.a"], { language: "javascript" });
const exA2 = exerciseFor("ex-a2", ["vim.a"], { language: "javascript" });
const exAPython = exerciseFor("ex-a-py", ["vim.a"], {
  language: "python",
  context: "config-file",
  transfer: true,
});
const exB = exerciseFor("ex-b", ["vim.b"]);

function contextFor(
  learner: LearnerState,
  now: number,
  extra: Partial<PriorityContext> = {},
): PriorityContext {
  return {
    now,
    skills,
    learner,
    stages: resolveStages(skills, learner, CONFIG),
    recent: [],
    history: [],
    ...extra,
  };
}

describe("exercise priority (T-407)", () => {
  it("is deterministic and explainable", () => {
    const learner = replay(skills, [[exA, PERFECT, T0]]);
    const ctx = contextFor(learner, T0 + 2 * DAY_MS);
    const first = scoreExercise(exA, ctx, CONFIG);
    expect(scoreExercise(exA, ctx, CONFIG)).toEqual(first);
    expect(first.skillId).toBe("vim.a");
    for (const part of [first.reviewDue, first.weakness, first.diversity, first.recentRepetition]) {
      expect(part).toBeGreaterThanOrEqual(0);
      expect(part).toBeLessThanOrEqual(1);
    }
  });

  it("ranks a due skill above one that is not due", () => {
    // exA falls due ~1.5 days after T0; exB is practiced just before the clock reading.
    const learner = replay(
      skills,
      [[exB, PERFECT, T0 + 1.9 * DAY_MS]],
      replay(skills, [[exA, PERFECT, T0]]),
    );
    const ctx = contextFor(learner, T0 + 2 * DAY_MS);
    expect(scoreExercise(exA, ctx, CONFIG).reviewDue).toBeGreaterThan(0);
    expect(scoreExercise(exB, ctx, CONFIG).reviewDue).toBe(0);
    expect(scoreExercise(exA, ctx, CONFIG).score).toBeGreaterThan(
      scoreExercise(exB, ctx, CONFIG).score,
    );
  });

  it("ranks a failed skill above a perfectly answered one", () => {
    const learner = replay(skills, [
      [exA, PERFECT, T0],
      [exA, PERFECT, T0 + 1000],
      [exA, PERFECT, T0 + 2000],
      [exB, FAILED, T0 + 3000],
    ]);
    const ctx = contextFor(learner, T0 + 20 * 60_000);
    const failed = scoreExercise(exB, ctx, CONFIG);
    const strong = scoreExercise(exA, ctx, CONFIG);
    expect(failed.reviewDue).toBeGreaterThan(strong.reviewDue);
    expect(failed.weakness).toBeGreaterThan(strong.weakness);
    expect(failed.score).toBeGreaterThan(strong.score);
  });

  it("weights unattempted skills as moderately weak, between failed and mastered", () => {
    const ctx = contextFor(replay(skills, [[exA, PERFECT, T0]]), T0);
    expect(scoreExercise(exB, ctx, CONFIG).weakness).toBe(0.5);
  });

  it("values a skill that still blocks many locked dependents", () => {
    const learner = EMPTY_LEARNER;
    const ctx = contextFor(learner, T0);
    const blocking = scoreExercise(exA, ctx, CONFIG);
    expect(blocking.prerequisiteNeed).toBe(1);
    // vim.b is locked, so it is not even available; once vim.a is practiced nothing blocks.
    const practiced = contextFor(
      replay(skills, [
        [exA, PERFECT, T0],
        [exA, PERFECT, T0 + 1000],
      ]),
      T0 + 2000,
    );
    expect(scoreExercise(exA, practiced, CONFIG).prerequisiteNeed).toBe(0);
  });

  it("rewards variety and penalizes repeating what was just practiced", () => {
    const learner = replay(skills, [
      [exA, PERFECT, T0],
      [exA, PERFECT, T0 + 1000],
      [exB, PERFECT, T0 + 2000],
    ]);
    const fresh = contextFor(learner, T0 + 5000);
    const afterA = contextFor(learner, T0 + 5000, {
      recent: [{ exerciseId: "ex-a", skillIds: ["vim.a"] }],
    });
    expect(scoreExercise(exA2, afterA, CONFIG).diversity).toBe(0);
    expect(scoreExercise(exB, afterA, CONFIG).diversity).toBe(1);
    expect(scoreExercise(exA, afterA, CONFIG).recentRepetition).toBe(1);
    expect(scoreExercise(exA2, afterA, CONFIG).recentRepetition).toBe(0);
    expect(scoreExercise(exA2, afterA, CONFIG).score).toBeLessThan(
      scoreExercise(exA2, fresh, CONFIG).score,
    );
    // The penalty fades the further back the pick was.
    const older = contextFor(learner, T0 + 5000, {
      recent: [
        { exerciseId: "ex-a", skillIds: ["vim.a"] },
        { exerciseId: "ex-b", skillIds: ["vim.b"] },
        { exerciseId: "ex-x", skillIds: ["vim.b"] },
      ],
    });
    expect(scoreExercise(exA2, older, CONFIG).diversity).toBe(0.75);
  });

  it("penalizes an exercise seen earlier, less as hours pass", () => {
    const learner = replay(skills, [[exA, PERFECT, T0]]);
    const history: AttemptRecord[] = [
      { exerciseId: "ex-a", skillIds: ["vim.a"], at: T0, success: true, performance: 100 },
    ];
    const soon = scoreExercise(exA, contextFor(learner, T0 + 3_600_000, { history }), CONFIG);
    const later = scoreExercise(exA, contextFor(learner, T0 + 3 * DAY_MS, { history }), CONFIG);
    expect(soon.recentRepetition).toBeGreaterThan(0.9);
    expect(later.recentRepetition).toBeLessThan(0.05);
  });

  it("asks for transfer only for practiced skills and unseen contexts", () => {
    const practiced = replay(skills, [
      [exA, PERFECT, T0],
      [exA, PERFECT, T0 + 1000],
    ]);
    const ctx = contextFor(practiced, T0 + 5000);
    expect(scoreExercise(exAPython, ctx, CONFIG).transferNeed).toBeGreaterThan(0.9);
    expect(scoreExercise(exA2, ctx, CONFIG).transferNeed).toBe(0);
    const fresh = contextFor(EMPTY_LEARNER, T0);
    expect(scoreExercise(exAPython, fresh, CONFIG).transferNeed).toBe(0);
  });

  it("scores a multi-skill exercise by its best skill", () => {
    const both = exerciseFor("ex-both", ["vim.a", "vim.b"], { language: "javascript" });
    const learner = replay(skills, [
      [exA, PERFECT, T0],
      [exA, PERFECT, T0 + 1000],
      [exB, FAILED, T0 + 2000],
    ]);
    const ctx = contextFor(learner, T0 + 20 * 60_000);
    expect(scoreExercise(both, ctx, CONFIG).skillId).toBe("vim.b");
  });

  it("only offers exercises whose skills are all unlocked", () => {
    const stages = resolveStages(skills, EMPTY_LEARNER, CONFIG);
    expect(isExerciseAvailable(exA, stages)).toBe(true);
    expect(isExerciseAvailable(exB, stages)).toBe(false);
    expect(isExerciseAvailable(exerciseFor("ex-both", ["vim.a", "vim.b"]), stages)).toBe(false);
  });
});
