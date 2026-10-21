import { describe, expect, it } from "vitest";
import { recordAttempt } from "./progress";
import { masteryBlockers } from "./mastery";
import { getUserSkill } from "./userSkill";
import { EMPTY_LEARNER } from "./types";
import {
  CONFIG,
  DAY_MS,
  FAILED,
  PERFECT,
  SLOPPY,
  T0,
  exerciseFor,
  replay,
  skillOf,
} from "./test-util";

const SKILL = "vim.operator.change";
// SKILL is a root here so its stage reflects evidence; the graph tests below use `graph`.
const skills = [
  skillOf("vim.mode.insert"),
  skillOf(SKILL, [], 3),
  skillOf("vim.repeat", [SKILL], 5),
];
const graph = [
  skillOf("vim.mode.insert"),
  skillOf(SKILL, ["vim.mode.insert"], 3),
  skillOf("vim.repeat", [SKILL], 5),
];
const home = exerciseFor("ex-home", [SKILL], { language: "javascript" });
const python = exerciseFor("ex-python", [SKILL], {
  language: "python",
  context: "config-file",
  transfer: true,
});
const lua = exerciseFor("ex-lua", [SKILL], {
  language: "lua",
  context: "config-file",
  transfer: true,
});
const json = exerciseFor("ex-json", [SKILL], {
  language: "json",
  context: "config-file",
  transfer: true,
});

describe("recordAttempt (T-401)", () => {
  it("creates the user skill with the full PRD shape on first attempt", () => {
    const { learner, updates } = recordAttempt(
      skills,
      EMPTY_LEARNER,
      { exercise: home, outcome: PERFECT, at: T0 },
      CONFIG,
    );
    const skill = getUserSkill(learner, SKILL);
    expect(skill).toMatchObject({
      skillId: SKILL,
      attemptCount: 1,
      lastAttemptAt: T0,
      retention: 0,
      transfer: 0,
      delayedRecallCount: 0,
      transferCount: 0,
      seenContexts: ["javascript/any"],
    });
    expect(skill.accuracy).toBeGreaterThan(0);
    expect(skill.nextReviewAt).toBe(skill.review?.dueAt);
    expect(skill.nextReviewAt).toBeGreaterThan(T0);
    expect(updates).toEqual([
      expect.objectContaining({ skillId: SKILL, delayedRecall: false, transferEvidence: false }),
    ]);
  });

  it("is pure: the input learner is untouched", () => {
    const before = JSON.stringify(EMPTY_LEARNER);
    recordAttempt(skills, EMPTY_LEARNER, { exercise: home, outcome: PERFECT, at: T0 }, CONFIG);
    expect(JSON.stringify(EMPTY_LEARNER)).toBe(before);
  });

  it("updates every skill an exercise trains", () => {
    const both = exerciseFor("ex-both", ["vim.mode.insert", SKILL]);
    const { learner } = recordAttempt(
      skills,
      EMPTY_LEARNER,
      { exercise: both, outcome: PERFECT, at: T0 },
      CONFIG,
    );
    expect(getUserSkill(learner, "vim.mode.insert").attemptCount).toBe(1);
    expect(getUserSkill(learner, SKILL).attemptCount).toBe(1);
  });

  it("a failed attempt adds no accuracy, strategy or fluency evidence and schedules a quick retry", () => {
    const after = replay(skills, [
      [home, PERFECT, T0],
      [home, FAILED, T0 + 60_000],
    ]);
    const skill = getUserSkill(after, SKILL);
    const afterFirst = getUserSkill(replay(skills, [[home, PERFECT, T0]]), SKILL);
    expect(skill.accuracy).toBeLessThan(afterFirst.accuracy);
    expect(skill.nextReviewAt).toBe(T0 + 60_000 + CONFIG.scheduler.lapseRetryMs);
  });

  it("hints reduce the evidence of a successful attempt", () => {
    const clean = getUserSkill(replay(skills, [[home, PERFECT, T0]]), SKILL);
    const helped = getUserSkill(replay(skills, [[home, { ...PERFECT, hintsUsed: 2 }, T0]]), SKILL);
    expect(helped.accuracy).toBeLessThan(clean.accuracy);
  });
});

describe("repetition cannot buy mastery (T-402)", () => {
  it("hundreds of same-session repetitions of one exercise stay below mastered", () => {
    const attempts = Array.from(
      { length: 300 },
      (_, index) => [home, PERFECT, T0 + index * 5_000] as const,
    );
    const skill = getUserSkill(replay(skills, attempts), SKILL);
    expect(skill.attemptCount).toBe(300);
    expect(skill.accuracy).toBeGreaterThan(99);
    expect(skill.retention).toBe(0);
    expect(skill.transfer).toBe(0);
    expect(skill.mastery).toBeLessThanOrEqual(70.0001);
    // Fluent is the ceiling of massed practice.
    expect(skill.stage).toBe("fluent");
    expect(masteryBlockers(skill, CONFIG).join(" ")).toMatch(/delayed recalls/);
  });

  it("even spaced recall of one exercise cannot master a skill without transfer", () => {
    const attempts = Array.from(
      { length: 12 },
      (_, index) => [home, PERFECT, T0 + index * 2 * DAY_MS] as const,
    );
    const skill = getUserSkill(replay(skills, attempts), SKILL);
    expect(skill.retention).toBeGreaterThan(80);
    expect(skill.delayedRecallCount).toBeGreaterThan(0);
    expect(skill.transfer).toBe(0);
    expect(skill.stage).not.toBe("mastered");
    expect(masteryBlockers(skill, CONFIG).join(" ")).toMatch(/transfer/);
  });

  it("transfer in one sitting, with no delayed recall, cannot master it either", () => {
    const skill = getUserSkill(
      replay(skills, [
        [home, PERFECT, T0],
        [python, PERFECT, T0 + 60_000],
        [lua, PERFECT, T0 + 120_000],
        [json, PERFECT, T0 + 180_000],
        [home, PERFECT, T0 + 240_000],
        [python, PERFECT, T0 + 300_000],
      ]),
      SKILL,
    );
    expect(skill.transfer).toBeGreaterThan(75);
    expect(skill.retention).toBe(0);
    expect(skill.stage).not.toBe("mastered");
  });

  it("reaches mastered with delayed recalls plus transfer", () => {
    const skill = getUserSkill(
      replay(skills, [
        [home, PERFECT, T0],
        [home, PERFECT, T0 + 1 * DAY_MS],
        [python, PERFECT, T0 + 2 * DAY_MS],
        [lua, PERFECT, T0 + 4 * DAY_MS],
        [json, PERFECT, T0 + 8 * DAY_MS],
        [home, PERFECT, T0 + 16 * DAY_MS],
        [python, PERFECT, T0 + 30 * DAY_MS],
      ]),
      SKILL,
    );
    expect(masteryBlockers(skill, CONFIG)).toEqual([]);
    expect(skill.stage).toBe("mastered");
    expect(skill.delayedRecallCount).toBeGreaterThanOrEqual(1);
    expect(skill.transferCount).toBeGreaterThanOrEqual(1);
  });

  it("a sloppy learner does not master it even with delayed recall and transfer", () => {
    const attempts = [home, python, lua, json, home, python, lua, json].map(
      (exercise, index) => [exercise, SLOPPY, T0 + index * 3 * DAY_MS] as const,
    );
    expect(getUserSkill(replay(skills, attempts), SKILL).stage).not.toBe("mastered");
  });
});

describe("delayed recall vs same-session repetition (T-410)", () => {
  it("only an attempt after the delay moves retention", () => {
    const same = replay(skills, [
      [home, PERFECT, T0],
      [home, PERFECT, T0 + 3_600_000],
    ]);
    expect(getUserSkill(same, SKILL).retention).toBe(0);
    const delayed = recordAttempt(
      skills,
      replay(skills, [[home, PERFECT, T0]]),
      { exercise: home, outcome: PERFECT, at: T0 + DAY_MS },
      CONFIG,
    );
    expect(delayed.updates[0]?.delayedRecall).toBe(true);
    expect(getUserSkill(delayed.learner, SKILL).retention).toBeGreaterThan(0);
    expect(getUserSkill(delayed.learner, SKILL).delayedRecallCount).toBe(1);
  });

  it("forgetting after the delay lowers retention", () => {
    const remembered = replay(skills, [
      [home, PERFECT, T0],
      [home, PERFECT, T0 + DAY_MS],
      [home, PERFECT, T0 + 3 * DAY_MS],
    ]);
    const forgotten = replay(skills, [[home, FAILED, T0 + 8 * DAY_MS]], remembered);
    expect(getUserSkill(forgotten, SKILL).retention).toBeLessThan(
      getUserSkill(remembered, SKILL).retention,
    );
    expect(getUserSkill(forgotten, SKILL).delayedRecallCount).toBe(
      getUserSkill(remembered, SKILL).delayedRecallCount,
    );
  });

  it("marks the scheduled review separately from early delayed practice", () => {
    const first = replay(skills, [[home, PERFECT, T0]]);
    const early = recordAttempt(
      skills,
      first,
      { exercise: home, outcome: PERFECT, at: T0 + 13 * 3_600_000 },
      CONFIG,
    );
    expect(early.updates[0]).toMatchObject({ delayedRecall: true, scheduledReview: false });
    const due = recordAttempt(
      skills,
      first,
      { exercise: home, outcome: PERFECT, at: T0 + 2 * DAY_MS },
      CONFIG,
    );
    expect(due.updates[0]).toMatchObject({ delayedRecall: true, scheduledReview: true });
  });
});

describe("transfer evidence (T-409)", () => {
  it("never counts the home context, or the first exposure", () => {
    const first = recordAttempt(
      skills,
      EMPTY_LEARNER,
      { exercise: python, outcome: PERFECT, at: T0 },
      CONFIG,
    );
    expect(first.updates[0]?.transferEvidence).toBe(false);
    expect(getUserSkill(first.learner, SKILL).transfer).toBe(0);
    const again = recordAttempt(
      skills,
      first.learner,
      { exercise: python, outcome: PERFECT, at: T0 + 1000 },
      CONFIG,
    );
    expect(again.updates[0]?.transferEvidence).toBe(false);
  });

  it("counts a new context once, and each new context raises transfer", () => {
    let learner = replay(skills, [[home, PERFECT, T0]]);
    const values: number[] = [];
    for (const exercise of [python, lua, json]) {
      const result = recordAttempt(
        skills,
        learner,
        { exercise, outcome: PERFECT, at: T0 + 1000 * (values.length + 1) },
        CONFIG,
      );
      expect(result.updates[0]?.transferEvidence).toBe(true);
      learner = result.learner;
      values.push(getUserSkill(learner, SKILL).transfer);
    }
    expect(values[0]).toBeLessThan(values[1] ?? 0);
    expect(values[1]).toBeLessThan(values[2] ?? 0);
    const repeated = recordAttempt(
      skills,
      learner,
      { exercise: python, outcome: PERFECT, at: T0 + 10_000 },
      CONFIG,
    );
    expect(repeated.updates[0]?.transferEvidence).toBe(false);
    expect(getUserSkill(repeated.learner, SKILL).transfer).toBe(
      getUserSkill(learner, SKILL).transfer,
    );
  });

  it("a failure in a new context lowers transfer but keeps the context open for a retry", () => {
    const learner = replay(skills, [[home, PERFECT, T0]]);
    const failed = recordAttempt(
      skills,
      learner,
      { exercise: python, outcome: FAILED, at: T0 + 1000 },
      CONFIG,
    );
    expect(failed.updates[0]?.transferEvidence).toBe(true);
    expect(getUserSkill(failed.learner, SKILL).transferCount).toBe(0);
    expect(getUserSkill(failed.learner, SKILL).seenContexts).not.toContain("python/config-file");
    const retry = recordAttempt(
      skills,
      failed.learner,
      { exercise: python, outcome: PERFECT, at: T0 + 2000 },
      CONFIG,
    );
    expect(retry.updates[0]?.transferEvidence).toBe(true);
    expect(getUserSkill(retry.learner, SKILL).transferCount).toBe(1);
  });
});

describe("stages follow the skill graph", () => {
  it("unlocks dependents once a prerequisite is practiced and relocks nothing it should not", () => {
    const insert = exerciseFor("ex-insert", ["vim.mode.insert"]);
    const start = recordAttempt(
      graph,
      EMPTY_LEARNER,
      { exercise: insert, outcome: PERFECT, at: T0 },
      CONFIG,
    ).learner;
    expect(start.skills["vim.mode.insert"]?.stage).toBe("learning");
    expect(start.skills[SKILL]).toBeUndefined();

    const after = replay(
      graph,
      [
        [insert, PERFECT, T0 + 1000],
        [insert, PERFECT, T0 + 2000],
      ],
      start,
    );
    expect(after.skills["vim.mode.insert"]?.stage).toBe("practicing");
    expect(after.skills[SKILL]?.stage).toBe("learning");
    expect(after.skills["vim.repeat"]).toBeUndefined();
  });

  it("walks learning → practicing → fluent with consistent good attempts", () => {
    // A root skill: the graph above would keep SKILL locked.
    const stages = [0, 1, 2, 3, 4, 5, 6].map(
      (index) =>
        getUserSkill(
          replay(
            skills,
            Array.from({ length: index + 1 }, (_, i) => [home, PERFECT, T0 + i * 1000] as const),
          ),
          SKILL,
        ).stage,
    );
    expect(stages[0]).toBe("learning");
    expect(stages).toContain("practicing");
    expect(stages.at(-1)).toBe("fluent");
  });
});
