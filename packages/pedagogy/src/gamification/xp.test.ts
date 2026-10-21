import { describe, expect, it } from "vitest";
import { DEFAULT_GAMIFICATION_CONFIG as CONFIG } from "./config";
import { awardAttemptXp, levelFor, type XpFacts } from "./xp";

const base: XpFacts = {
  success: true,
  feedback: "completed",
  hintsUsed: 0,
  scheduledReview: false,
  transferEvidence: false,
  personalBests: 0,
  priorCompletionsToday: 0,
  xpToday: 0,
  combo: 1,
};
const award = (overrides: Partial<XpFacts> = {}) => awardAttemptXp({ ...base, ...overrides });

describe("attempt XP (T-801)", () => {
  it("pays the completion XP for a solved exercise", () => {
    expect(award().total).toBe(CONFIG.xp.completion);
    expect(award().parts).toEqual([{ kind: "completion", amount: CONFIG.xp.completion }]);
  });

  it("pays nothing for a failed attempt, whatever else is claimed", () => {
    const failed = award({
      success: false,
      feedback: "failed",
      scheduledReview: true,
      transferEvidence: true,
      personalBests: 3,
      combo: 9,
    });
    expect(failed.total).toBe(0);
    expect(failed.parts).toEqual([]);
  });

  it("adds a bonus for a perfect run, a due review and transfer", () => {
    expect(award({ feedback: "perfect" }).total).toBe(
      CONFIG.xp.completion + CONFIG.xp.perfectBonus,
    );
    expect(award({ scheduledReview: true }).total).toBe(
      CONFIG.xp.completion + CONFIG.xp.scheduledReviewBonus,
    );
    expect(award({ transferEvidence: true }).total).toBe(
      CONFIG.xp.completion + CONFIG.xp.transferBonus,
    );
    const everything = award({
      feedback: "perfect",
      scheduledReview: true,
      transferEvidence: true,
    });
    expect(everything.parts.map((part) => part.kind)).toEqual([
      "completion",
      "perfect",
      "scheduled-review",
      "transfer",
    ]);
  });

  it("pays less for hints, and never less than the other bonuses", () => {
    expect(award({ hintsUsed: 1 }).total).toBe(Math.round(CONFIG.xp.completion * 0.75));
    expect(award({ hintsUsed: 9 }).total).toBe(0);
    expect(award({ hintsUsed: 9, scheduledReview: true }).total).toBe(
      CONFIG.xp.scheduledReviewBonus,
    );
  });

  it("pays personal bests per improved metric, up to a cap", () => {
    expect(award({ personalBests: 1 }).total).toBe(
      CONFIG.xp.completion + CONFIG.xp.personalBestBonus,
    );
    expect(award({ personalBests: 4 }).total).toBe(
      CONFIG.xp.completion + CONFIG.xp.maxPersonalBestMetrics * CONFIG.xp.personalBestBonus,
    );
  });

  it("pays less each time the same exercise is solved the same day, then nothing", () => {
    const totals = [0, 1, 2, 3, 4].map((prior) => award({ priorCompletionsToday: prior }).total);
    expect(totals).toEqual([10, 5, 3, 0, 0]);
  });

  it("does not decay a personal best: it needs a real improvement", () => {
    const repeated = award({ priorCompletionsToday: 5, personalBests: 1 });
    expect(repeated.total).toBe(CONFIG.xp.personalBestBonus);
  });

  it("adds a bounded bonus for the combo", () => {
    expect(award({ combo: 1 }).total).toBe(10);
    expect(award({ combo: 3 }).comboMultiplier).toBeCloseTo(1.1);
    expect(award({ combo: 100 }).comboMultiplier).toBeCloseTo(1 + CONFIG.xp.comboBonusMax);
    expect(award({ combo: 100 }).total).toBe(Math.round(10 * (1 + CONFIG.xp.comboBonusMax)));
  });

  it("stops at the daily cap and says so", () => {
    const near = award({ xpToday: CONFIG.xp.dailyCap - 4 });
    expect(near.total).toBe(4);
    expect(near.capped).toBe(true);
    expect(award({ xpToday: CONFIG.xp.dailyCap }).total).toBe(0);
    expect(award({ xpToday: 0 }).capped).toBe(false);
  });

  it("cannot be farmed: grinding one exercise all day earns a small, bounded amount", () => {
    let xpToday = 0;
    let total = 0;
    for (let prior = 0; prior < 500; prior++) {
      const gained = award({ priorCompletionsToday: prior, xpToday, combo: prior + 1 }).total;
      xpToday += gained;
      total += gained;
    }
    expect(total).toBeLessThanOrEqual(25);
  });

  it("is a pure function of its facts", () => {
    const facts = { ...base, feedback: "perfect" as const, combo: 4, personalBests: 1 };
    expect(awardAttemptXp(facts)).toEqual(awardAttemptXp({ ...facts }));
  });

  it("reads nothing about mastery: its facts are about the attempt only", () => {
    // The type is the guarantee; this documents it. Mastery, stage and learner state are not inputs.
    const keys = Object.keys(base).sort();
    expect(keys).toEqual([
      "combo",
      "feedback",
      "hintsUsed",
      "personalBests",
      "priorCompletionsToday",
      "scheduledReview",
      "success",
      "transferEvidence",
      "xpToday",
    ]);
  });
});

describe("levels", () => {
  it("starts at level 1 with no XP", () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: 100 });
  });

  it("carries leftover XP into the next level", () => {
    expect(levelFor(100)).toMatchObject({ level: 2, into: 0 });
    expect(levelFor(99)).toMatchObject({ level: 1, into: 99 });
    const second = levelFor(150);
    expect(second.level).toBe(2);
    expect(second.into).toBe(50);
  });

  it("gets harder and never goes backwards", () => {
    let previous = 1;
    for (let xp = 0; xp < 20_000; xp += 37) {
      const { level } = levelFor(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
    expect(levelFor(200).needed).toBeGreaterThan(levelFor(0).needed);
  });

  it("treats negative XP as none", () => {
    expect(levelFor(-5).level).toBe(1);
  });
});
