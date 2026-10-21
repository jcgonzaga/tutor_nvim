import { describe, expect, it } from "vitest";
import { buildDailySession, sessionItems } from "./session";
import { masteryBlockers } from "./mastery";
import { getUserSkill } from "./userSkill";
import { resolveStages } from "./unlock";
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

/**
 * M4 exit criteria on one synthetic user history:
 * weak skills return sooner, strong skills later, prerequisites gate new skills,
 * the daily session mixes categories, and mastery requires retention and transfer.
 */
const skills = [
  skillOf("vim.strong"),
  skillOf("vim.weak"),
  skillOf("vim.next", ["vim.strong", "vim.weak"], 2),
  skillOf("vim.far", ["vim.next"], 3),
];
const strong = exerciseFor("ex-strong", ["vim.strong"], { language: "javascript" });
const strongPy = exerciseFor("ex-strong-py", ["vim.strong"], {
  language: "python",
  context: "config-file",
  transfer: true,
});
const strong2 = exerciseFor("ex-strong-2", ["vim.strong"], {
  language: "javascript",
  difficulty: 3,
});
const weak = exerciseFor("ex-weak", ["vim.weak"], { language: "javascript" });
const weak2 = exerciseFor("ex-weak-2", ["vim.weak"], { language: "javascript", difficulty: 3 });
const next = exerciseFor("ex-next", ["vim.next"], { language: "javascript" });
const far = exerciseFor("ex-far", ["vim.far"], { language: "javascript" });
const exercises = [strong, strongPy, strong2, weak, weak2, next, far];

// Day 0: strong is answered perfectly three times; weak is failed once, then answered sloppily.
// Day 2 and 5: strong is reviewed on schedule and stays perfect.
const history = replay(skills, [
  [strong, PERFECT, T0],
  [strong, PERFECT, T0 + 60_000],
  [strong, PERFECT, T0 + 120_000],
  [weak, FAILED, T0 + 180_000],
  [weak, SLOPPY, T0 + 240_000],
  [weak, SLOPPY, T0 + 300_000],
  [weak, SLOPPY, T0 + 360_000],
  [weak, SLOPPY, T0 + 420_000],
  [strong, PERFECT, T0 + 2 * DAY_MS],
  [strong2, PERFECT, T0 + 5 * DAY_MS],
]);
const NOW = T0 + 6 * DAY_MS;

describe("M4 exit criteria on a synthetic history", () => {
  it("weak skills return sooner than strong ones", () => {
    const weakSkill = getUserSkill(history, "vim.weak");
    const strongSkill = getUserSkill(history, "vim.strong");
    expect(weakSkill.nextReviewAt).toBeLessThan(strongSkill.nextReviewAt ?? 0);
    expect(weakSkill.review?.stability).toBeLessThan(strongSkill.review?.stability ?? 0);
    expect(weakSkill.nextReviewAt).toBeLessThan(NOW);
    expect(strongSkill.nextReviewAt).toBeGreaterThan(NOW);
  });

  it("prerequisites gate new skills", () => {
    const stages = resolveStages(skills, history, CONFIG);
    expect(stages["vim.strong"]).toBe("fluent");
    expect(stages["vim.weak"]).toBe("practicing");
    // Both prerequisites reached practicing, so the next skill opens; the one behind it stays shut.
    expect(stages["vim.next"]).toBe("learning");
    expect(stages["vim.far"]).toBe("locked");

    // One strong prerequisite is not enough, and neither is a weak one that keeps failing.
    const onlyStrong = replay(skills, [
      [strong, PERFECT, T0],
      [strong, PERFECT, T0 + 1000],
    ]);
    expect(resolveStages(skills, onlyStrong, CONFIG)["vim.next"]).toBe("locked");
    const stillFailing = replay(skills, [
      [strong, PERFECT, T0],
      [strong, PERFECT, T0 + 1000],
      [weak, FAILED, T0 + 2000],
      [weak, FAILED, T0 + 3000],
      [weak, FAILED, T0 + 4000],
    ]);
    expect(resolveStages(skills, stillFailing, CONFIG)["vim.next"]).toBe("locked");
  });

  it("the daily session mixes categories and starts with the weak, due skill", () => {
    const session = buildDailySession(
      {
        userId: "u",
        date: "2026-01-07",
        now: NOW,
        skills,
        exercises,
        learner: history,
        history: [],
      },
      CONFIG,
    );
    expect(session.reviews.map((item) => item.skillId)).toContain("vim.weak");
    expect(session.reviews.map((item) => item.skillId)).not.toContain("vim.strong");
    expect(session.learn.map((item) => item.skillId)).toEqual(["vim.next"]);
    expect(session.challenge.map((item) => item.exerciseId)).toEqual(["ex-strong-py"]);
    expect(new Set(sessionItems(session).map((item) => item.block)).size).toBeGreaterThanOrEqual(3);
    expect(sessionItems(session).map((item) => item.skillId)).not.toContain("vim.far");
  });

  it("mastery requires retention and transfer: strong is fluent, not mastered", () => {
    const skill = getUserSkill(history, "vim.strong");
    expect(skill.retention).toBeGreaterThan(0);
    expect(skill.transfer).toBe(0);
    expect(skill.stage).toBe("fluent");

    const transferred = replay(
      skills,
      [
        [strongPy, PERFECT, T0 + 6 * DAY_MS],
        [strong, PERFECT, T0 + 12 * DAY_MS],
        [strongPy, PERFECT, T0 + 20 * DAY_MS],
      ],
      history,
    );
    // One new context is real evidence, but not yet enough for mastery.
    const skill2 = getUserSkill(transferred, "vim.strong");
    expect(skill2.transferCount).toBe(1);
    expect(skill2.transfer).toBeGreaterThan(0);
    expect(masteryBlockers(skill2, CONFIG).join(" ")).toMatch(/transfer/);
  });
});
