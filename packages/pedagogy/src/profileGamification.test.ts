import { describe, expect, it } from "vitest";
import {
  applyAttempt,
  completeSessionItem,
  completionsOn,
  createProfile,
  endSession,
  finishAttempt,
  startSession,
  type FinishedAttempt,
  type Profile,
  type RewardInput,
} from "./profile";
import { DEFAULT_GAMIFICATION_CONFIG as GAME } from "./gamification";
import type { DailySession } from "./session";
import { DAY_MS, T0, exerciseFor, skillOf } from "./test-util";

const skills = [skillOf("vim.a"), skillOf("vim.b", ["vim.a"], 2)];
const a = exerciseFor("ex-a", ["vim.a"], { language: "javascript" });
const b = exerciseFor("ex-b", ["vim.a"], { language: "python" });
const more = ["ex-c", "ex-d", "ex-e", "ex-f"].map((id) =>
  exerciseFor(id, ["vim.a"], { language: "lua" }),
);

const metrics = {
  success: true,
  accuracyScore: 100,
  strategyScore: 100,
  fluencyScore: 100,
  performanceScore: 90,
  hintsUsed: 0,
  totalDurationMs: 2000,
  efficiencyScore: 100,
  firstInputLatencyMs: 400,
};
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const DAY = dayOf(T0);

const attemptOf = (
  exercise = a,
  at = T0,
  overrides: Partial<FinishedAttempt["metrics"]> = {},
): FinishedAttempt => ({ exercise, metrics: { ...metrics, ...overrides }, at });

const rewardOf = (overrides: Partial<RewardInput> = {}, at = T0): RewardInput => ({
  feedback: "perfect",
  strategy: "optimal",
  maxHintLevel: 0,
  antiPatterns: 0,
  run: { keys: ["x"], times: [100], durationMs: 2000, performance: 90, at },
  day: dayOf(at),
  dayOf,
  inSession: false,
  ...overrides,
});

const plan: DailySession = {
  userId: "u",
  date: DAY,
  seed: "",
  warmup: [],
  reviews: [],
  learn: [
    { exerciseId: "ex-a", skillId: "vim.a", block: "learn", reason: "t" },
    { exerciseId: "ex-b", skillId: "vim.a", block: "learn", reason: "t" },
  ],
  mixed: [],
  challenge: [],
};
const options = {
  exerciseIdsForSkill: () => ["ex-a", "ex-b"],
  skillsOf: () => ["vim.a"],
};

describe("XP does not touch learning (AGENTS 2.7)", () => {
  it("leaves the learner exactly as the plain learning path computes it", () => {
    let game = createProfile("u", T0);
    let plain = createProfile("u", T0);
    for (let i = 0; i < 6; i++) {
      const at = T0 + i * 3 * 3600_000;
      const attempt = attemptOf(i % 2 ? b : a, at, { performanceScore: 60 + i * 5 });
      game = finishAttempt(game, skills, attempt, rewardOf({}, at)).profile;
      plain = applyAttempt(plain, skills, attempt).profile;
    }
    expect(game.learner).toEqual(plain.learner);
    expect(game.history).toEqual(plain.history);
    expect(game.personalBests).toEqual(plain.personalBests);
    expect(game.gamification.xp).toBeGreaterThan(0);
  });

  it("cannot be farmed into mastery: grinding one exercise gives bounded XP and the same learner as without XP", () => {
    let profile = createProfile("u", T0);
    for (let i = 0; i < 100; i++) {
      profile = finishAttempt(
        profile,
        skills,
        attemptOf(a, T0 + i * 1000),
        rewardOf({}, T0 + i * 1000),
      ).profile;
    }
    // 15 for the first perfect run, then half, then a quarter, then nothing.
    expect(profile.gamification.xp).toBe(15 + 8 + 4);
    // Still only the evidence one exercise in one context can give: never mastered.
    expect(profile.learner.skills["vim.a"]?.stage).not.toBe("mastered");
  });
});

describe("finishing an attempt", () => {
  it("awards XP for a solved attempt and records the day's total", () => {
    const result = finishAttempt(createProfile("u", T0), skills, attemptOf(), rewardOf());
    expect(result.award.total).toBe(GAME.xp.completion + GAME.xp.perfectBonus);
    expect(result.profile.gamification.xp).toBe(result.award.total);
    expect(result.profile.gamification.xpByDay[DAY]).toBe(result.award.total);
  });

  it("awards nothing for a failure and keeps the best run untouched", () => {
    const result = finishAttempt(
      createProfile("u", T0),
      skills,
      attemptOf(a, T0, { success: false, performanceScore: 0 }),
      rewardOf({ feedback: "failed", strategy: "failed" }),
    );
    expect(result.award.total).toBe(0);
    expect(result.profile.gamification.xp).toBe(0);
    expect(result.profile.gamification.bestRuns).toEqual({});
  });

  it("pays less when the same exercise is solved again the same day", () => {
    const first = finishAttempt(createProfile("u", T0), skills, attemptOf(), rewardOf());
    const second = finishAttempt(
      first.profile,
      skills,
      attemptOf(a, T0 + 60_000),
      rewardOf({}, T0 + 60_000),
    );
    expect(second.award.repeatFactor).toBe(0.5);
    expect(second.award.total).toBeLessThan(first.award.total);
  });

  it("pays the full amount again on another day", () => {
    const first = finishAttempt(createProfile("u", T0), skills, attemptOf(), rewardOf());
    const later = T0 + DAY_MS;
    const next = finishAttempt(first.profile, skills, attemptOf(a, later), rewardOf({}, later));
    expect(next.award.repeatFactor).toBe(1);
  });

  it("counts the earlier completions of the day without counting the attempt itself", () => {
    const first = finishAttempt(createProfile("u", T0), skills, attemptOf(), rewardOf());
    expect(completionsOn(first.profile.history, "ex-a", DAY, dayOf)).toBe(1);
    expect(completionsOn(first.profile.history, "ex-a", dayOf(T0 + DAY_MS), dayOf)).toBe(0);
    expect(completionsOn(first.profile.history, "ex-b", DAY, dayOf)).toBe(0);
  });

  it("keeps the best run of an exercise, replacing it only with a better one", () => {
    const first = finishAttempt(createProfile("u", T0), skills, attemptOf(), rewardOf());
    const worse = finishAttempt(
      first.profile,
      skills,
      attemptOf(a, T0 + 1000, { performanceScore: 50 }),
      rewardOf(
        { run: { keys: ["bad"], times: [1], durationMs: 9, performance: 50, at: T0 + 1000 } },
        T0 + 1000,
      ),
    );
    expect(worse.profile.gamification.bestRuns["ex-a"]?.keys).toEqual(["x"]);
    const better = finishAttempt(
      worse.profile,
      skills,
      attemptOf(a, T0 + 2000, { performanceScore: 99 }),
      rewardOf(
        { run: { keys: ["best"], times: [1], durationMs: 9, performance: 99, at: T0 + 2000 } },
        T0 + 2000,
      ),
    );
    expect(better.profile.gamification.bestRuns["ex-a"]?.keys).toEqual(["best"]);
  });

  it("remembers a personal best for the home screen", () => {
    const first = finishAttempt(createProfile("u", T0), skills, attemptOf(), rewardOf());
    const quicker = finishAttempt(
      first.profile,
      skills,
      attemptOf(a, T0 + 5000, { totalDurationMs: 1500 }),
      rewardOf({}, T0 + 5000),
    );
    expect(quicker.profile.gamification.recentBests).toEqual([
      { exerciseId: "ex-a", metrics: ["time"], at: T0 + 5000 },
    ]);
  });

  it("does not mutate the previous profile", () => {
    const before = createProfile("u", T0);
    const snapshot = structuredClone(before);
    finishAttempt(before, skills, attemptOf(), rewardOf());
    expect(before).toEqual(snapshot);
  });
});

describe("the combo lives in the session", () => {
  const started = (): Profile => startSession(createProfile("u", T0), plan, T0);
  const play = (profile: Profile, overrides: Partial<RewardInput>, at: number) =>
    finishAttempt(
      profile,
      skills,
      attemptOf(a, at),
      rewardOf({ inSession: true, ...overrides }, at),
    );

  it("grows across consecutive good attempts and is stored on the session", () => {
    const one = play(started(), {}, T0);
    const two = play(one.profile, {}, T0 + 60_000);
    expect(one.combo.state.current).toBe(1);
    expect(two.combo.state.current).toBe(2);
    expect(two.profile.activeSession?.combo).toEqual({ current: 2, best: 2 });
    expect(two.profile.gamification.bestCombo).toBe(2);
  });

  it("raises the XP a little as the combo grows", () => {
    let profile = started();
    const totals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const at = T0 + i * 60_000;
      const result = finishAttempt(
        profile,
        skills,
        { exercise: more[i] ?? a, metrics, at },
        rewardOf({ inSession: true, feedback: "completed" }, at),
      );
      totals.push(result.award.total);
      profile = result.profile;
    }
    expect(totals[3] ?? 0).toBeGreaterThan(totals[0] ?? 0);
  });

  it("resets on a failure, a strong hint or an anti-pattern", () => {
    const built = play(play(started(), {}, T0).profile, {}, T0 + 60_000);
    expect(play(built.profile, { strategy: "failed" }, T0 + 120_000).combo.state.current).toBe(0);
    expect(play(built.profile, { maxHintLevel: 2 }, T0 + 120_000).combo.state.current).toBe(0);
    expect(play(built.profile, { antiPatterns: 1 }, T0 + 120_000).combo.state.current).toBe(0);
  });

  it("does not exist outside a session: free practice builds no combo", () => {
    const result = finishAttempt(
      createProfile("u", T0),
      skills,
      attemptOf(),
      rewardOf({ inSession: false }),
    );
    expect(result.profile.activeSession).toBeNull();
    expect(result.award.comboMultiplier).toBe(1);
  });

  it("starts at zero in the next session", () => {
    const done = play(started(), {}, T0).profile;
    const ended = endSession(done, T0 + 1000, true);
    expect(startSession(ended, plan, T0 + 2000).activeSession?.combo).toEqual({
      current: 0,
      best: 0,
    });
  });
});

describe("completing the daily session (T-803)", () => {
  const result = (xp: number) => ({
    success: true,
    performance: 90,
    at: T0,
    scheduledReview: false,
    improved: [],
    xp,
    skillUpdates: [],
  });

  it("pays the streak and the daily bonus when the last exercise is done, and only once", () => {
    let profile = startSession(createProfile("u", T0), plan, T0);
    profile = completeSessionItem(profile, result(10), options);
    expect(profile.activeSession?.rewards).toBeNull();
    expect(profile.gamification.streak.current).toBe(0);

    profile = completeSessionItem(profile, result(10), options);
    expect(profile.activeSession?.rewards).toEqual({
      dailyBonusXp: GAME.xp.dailyCompletionBonus,
      streak: 1,
      longestStreak: 1,
      firstOfDay: true,
    });
    expect(profile.gamification.xp).toBe(GAME.xp.dailyCompletionBonus);
    expect(profile.gamification.streak).toEqual({ current: 1, longest: 1, lastDay: DAY });
  });

  it("does not pay again for a second session on the same day, and the streak stays at one", () => {
    let profile = startSession(createProfile("u", T0), plan, T0);
    profile = completeSessionItem(
      completeSessionItem(profile, result(0), options),
      result(0),
      options,
    );
    profile = endSession(profile, T0 + 1000, false);
    profile = startSession(profile, plan, T0 + 2000);
    profile = completeSessionItem(
      completeSessionItem(profile, result(0), options),
      result(0),
      options,
    );

    expect(profile.activeSession?.rewards).toMatchObject({
      dailyBonusXp: 0,
      firstOfDay: false,
      streak: 1,
    });
    expect(profile.gamification.xp).toBe(GAME.xp.dailyCompletionBonus);
  });

  it("continues the streak the next day and forgives a single missed day", () => {
    let profile = createProfile("u", T0);
    for (const offset of [0, 1, 3]) {
      const date = dayOf(T0 + offset * DAY_MS);
      profile = startSession(profile, { ...plan, date }, T0 + offset * DAY_MS);
      profile = completeSessionItem(
        completeSessionItem(profile, result(0), options),
        result(0),
        options,
      );
      profile = endSession(profile, T0 + offset * DAY_MS + 1000, false);
    }
    expect(profile.gamification.streak).toMatchObject({ current: 3, longest: 3 });
  });

  it("an abandoned session pays nothing", () => {
    let profile = startSession(createProfile("u", T0), plan, T0);
    profile = completeSessionItem(profile, result(10), options);
    profile = endSession(profile, T0 + 1000, true);
    expect(profile.gamification.xp).toBe(0);
    expect(profile.gamification.streak.current).toBe(0);
  });

  it("records the session's XP, daily bonus included, in its history entry", () => {
    let profile = startSession(createProfile("u", T0), plan, T0);
    profile = completeSessionItem(
      completeSessionItem(profile, result(10), options),
      result(7),
      options,
    );
    profile = endSession(profile, T0 + 1000, false);
    expect(profile.sessions[0]?.xp).toBe(17 + GAME.xp.dailyCompletionBonus);
  });
});
