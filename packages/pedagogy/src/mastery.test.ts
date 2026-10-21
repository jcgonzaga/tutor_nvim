import { describe, expect, it } from "vitest";
import { computeMastery, deriveStage, masteryBlockers } from "./mastery";
import { createUserSkill } from "./userSkill";
import { CONFIG } from "./test-util";
import type { UserSkill } from "./types";

const skill = (overrides: Partial<UserSkill> = {}): UserSkill => ({
  ...createUserSkill("vim.test"),
  ...overrides,
});

describe("computeMastery (T-402)", () => {
  it("weights the five dimensions 30/20/20/20/10", () => {
    const mastery = computeMastery(
      { accuracy: 100, strategy: 0, fluency: 0, retention: 0, transfer: 0, attemptCount: 10 },
      CONFIG,
    );
    expect(mastery).toBeCloseTo(30);
    expect(
      computeMastery(
        {
          accuracy: 100,
          strategy: 100,
          fluency: 100,
          retention: 100,
          transfer: 100,
          attemptCount: 10,
        },
        CONFIG,
      ),
    ).toBeCloseTo(100);
  });

  it("without delayed recall or transfer the ceiling is 70, below the mastered threshold", () => {
    const mastery = computeMastery(
      { accuracy: 100, strategy: 100, fluency: 100, retention: 0, transfer: 0, attemptCount: 1000 },
      CONFIG,
    );
    expect(mastery).toBeCloseTo(70);
    expect(mastery).toBeLessThan(CONFIG.stages.mastered.minMastery);
  });

  it("scales down while few attempts back the numbers", () => {
    const full = { accuracy: 100, strategy: 100, fluency: 100, retention: 100, transfer: 100 };
    expect(computeMastery({ ...full, attemptCount: 1 }, CONFIG)).toBeCloseTo(20);
    expect(computeMastery({ ...full, attemptCount: 5 }, CONFIG)).toBeCloseTo(100);
  });

  it("honors custom weights", () => {
    const config = {
      ...CONFIG,
      mastery: {
        ...CONFIG.mastery,
        weights: { accuracy: 1, strategy: 0, fluency: 0, retention: 0, transfer: 0 },
      },
    };
    expect(
      computeMastery(
        { accuracy: 80, strategy: 0, fluency: 0, retention: 0, transfer: 0, attemptCount: 9 },
        config,
      ),
    ).toBeCloseTo(80);
  });
});

describe("deriveStage (T-403)", () => {
  const strong = {
    mastery: 90,
    accuracy: 98,
    strategy: 90,
    fluency: 90,
    retention: 85,
    transfer: 80,
    attemptCount: 12,
    delayedRecallCount: 2,
    transferCount: 2,
  };

  it("is locked whatever the evidence while prerequisites are missing", () => {
    expect(deriveStage(skill(strong), false, CONFIG)).toBe("locked");
  });

  it("starts at learning, then practicing once there are attempts with decent accuracy", () => {
    expect(deriveStage(skill(), true, CONFIG)).toBe("learning");
    expect(deriveStage(skill({ attemptCount: 2, accuracy: 55 }), true, CONFIG)).toBe("practicing");
    expect(deriveStage(skill({ attemptCount: 2, accuracy: 30 }), true, CONFIG)).toBe("learning");
  });

  it("is fluent with solid mastery, accuracy and fluency", () => {
    expect(
      deriveStage(skill({ mastery: 62, accuracy: 85, fluency: 70, attemptCount: 6 }), true, CONFIG),
    ).toBe("fluent");
  });

  it("is mastered only when every criterion holds", () => {
    expect(deriveStage(skill(strong), true, CONFIG)).toBe("mastered");
    expect(masteryBlockers(skill(strong), CONFIG)).toEqual([]);
  });

  it.each([
    ["delayedRecallCount", 0, "delayed recalls"],
    ["transferCount", 0, "transfer exercises"],
    ["transfer", 40, "transfer 40"],
    ["retention", 50, "retention 50"],
    ["accuracy", 90, "accuracy 90"],
  ] as const)("is not mastered when %s is %s", (field, value, blocker) => {
    const weakened = skill({ ...strong, [field]: value });
    expect(deriveStage(weakened, true, CONFIG)).not.toBe("mastered");
    expect(masteryBlockers(weakened, CONFIG).join(" ")).toContain(blocker);
  });
});
