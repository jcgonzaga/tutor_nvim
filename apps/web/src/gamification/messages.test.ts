import { describe, expect, it } from "vitest";
import {
  EMPTY_COMBO,
  EMPTY_GAMIFICATION,
  awardAttemptXp,
  recordCompletedDay,
  updateCombo,
} from "@tutor-nvim/pedagogy";
import { describeCombo, describeParts, describeStreak } from "./messages";

const good = { success: true, strategy: "optimal", maxHintLevel: 0, antiPatterns: 0 } as const;

describe("streak wording", () => {
  const withStreak = (days: string[]) => ({
    ...EMPTY_GAMIFICATION,
    streak: days.reduce((state, day) => recordCompletedDay(state, day), EMPTY_GAMIFICATION.streak),
  });

  it("invites a newcomer to start one", () => {
    expect(describeStreak(EMPTY_GAMIFICATION, "2026-10-21")).toBe(
      "Finish a session to start a streak.",
    );
  });

  it("states a live streak plainly", () => {
    expect(describeStreak(withStreak(["2026-10-21"]), "2026-10-21")).toBe("1-day streak");
    expect(describeStreak(withStreak(["2026-10-20", "2026-10-21"]), "2026-10-21")).toBe(
      "2-day streak",
    );
  });

  it("keeps showing it through the forgiven day", () => {
    expect(describeStreak(withStreak(["2026-10-20", "2026-10-21"]), "2026-10-23")).toBe(
      "2-day streak",
    );
  });

  it("welcomes someone back after a long gap without a word about loss", () => {
    const text = describeStreak(
      withStreak(["2026-10-01", "2026-10-02", "2026-10-03"]),
      "2026-10-21",
    );
    expect(text).toContain("Welcome back");
    expect(text).toContain("3 days");
    expect(text.toLowerCase()).not.toMatch(/lost|broke|miss|fail/);
  });
});

describe("combo wording", () => {
  it("shows the multiplier as it grows", () => {
    expect(describeCombo(updateCombo(EMPTY_COMBO, good))).toBe("Combo ×1");
  });

  it("calls a reset a fresh start, with the reason", () => {
    const failed = describeCombo(updateCombo({ current: 4, best: 4 }, { ...good, success: false }));
    expect(failed).toBe("Combo reset: a fresh start");
    expect(
      describeCombo(updateCombo({ current: 4, best: 4 }, { ...good, maxHintLevel: 2 })),
    ).toContain("strong hint");
    expect(
      describeCombo(updateCombo({ current: 4, best: 4 }, { ...good, antiPatterns: 1 })),
    ).toContain("anti-pattern");
  });

  it("says when a correct but clumsy solution kept the combo", () => {
    expect(
      describeCombo(updateCombo({ current: 2, best: 2 }, { ...good, strategy: "inefficient" })),
    ).toBe("Combo ×2 kept");
  });
});

describe("XP wording", () => {
  it("lists where the XP came from", () => {
    const award = awardAttemptXp({
      success: true,
      feedback: "perfect",
      hintsUsed: 0,
      scheduledReview: true,
      transferEvidence: false,
      personalBests: 0,
      priorCompletionsToday: 0,
      xpToday: 0,
      combo: 1,
    });
    expect(describeParts(award)).toEqual(["Solved +10", "Perfect run +5", "Review done +6"]);
  });
});
