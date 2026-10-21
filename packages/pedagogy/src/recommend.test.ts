import { describe, expect, it } from "vitest";
import { refreshStages } from "./progress";
import { recommendNext } from "./recommend";
import { EMPTY_LEARNER } from "./types";
import { DAY_MS, PERFECT, T0, exerciseFor, replay, skillOf } from "./test-util";

const skills = [skillOf("vim.a"), skillOf("vim.b", ["vim.a"], 2), skillOf("vim.c", ["vim.b"], 3)];
const a = exerciseFor("ex-a", ["vim.a"]);

describe("recommendNext", () => {
  it("suggests the first skill to learn for a brand-new learner", () => {
    expect(recommendNext(skills, EMPTY_LEARNER, T0)).toEqual({ kind: "learn", skillId: "vim.a" });
  });

  it("asks for due reviews before anything new, earliest tier first", () => {
    const learner = replay(skills, [[a, PERFECT, T0]]);
    expect(recommendNext(skills, learner, T0 + 30 * DAY_MS)).toEqual({
      kind: "review-due",
      skillIds: ["vim.a"],
    });
  });

  it("moves on to the next unattempted skill once nothing is due", () => {
    const learner = replay(skills, [
      [a, PERFECT, T0],
      [a, PERFECT, T0 + 60_000],
      [a, PERFECT, T0 + 120_000],
    ]);
    // vim.a is practicing, so vim.b is unlocked and untouched; vim.a's review is days away.
    expect(recommendNext(skills, learner, T0 + 180_000)).toEqual({
      kind: "learn",
      skillId: "vim.b",
    });
  });

  it("falls back to when the next review arrives when there is nothing new and nothing due", () => {
    const only = [skillOf("vim.a")];
    const learner = replay(only, [[a, PERFECT, T0]]);
    const next = recommendNext(only, learner, T0 + 60_000);
    expect(next).toMatchObject({ kind: "next-review", skillId: "vim.a" });
    expect(next.kind === "next-review" && next.at > T0 + 60_000).toBe(true);
  });

  it("has nothing to recommend when no skill is left to learn or review", () => {
    const disabled = [skillOf("vim.a")].map((skill) => ({ ...skill, enabled: false }));
    expect(recommendNext(disabled, EMPTY_LEARNER, T0)).toEqual({ kind: "all-caught-up" });
  });

  it("suggests a skill placed past only after the ones the learner has not been placed past", () => {
    const placed = { skills: {}, placed: ["vim.a"] };
    // vim.a is placed (a quick check); vim.b is unlocked by that placement and genuinely new.
    expect(recommendNext(skills, refresh(placed), T0)).toEqual({ kind: "learn", skillId: "vim.b" });
  });
});

function refresh(learner: { skills: Record<string, never>; placed: string[] }) {
  return refreshStages(skills, learner);
}
