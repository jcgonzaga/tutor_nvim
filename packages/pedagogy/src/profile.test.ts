import { describe, expect, it } from "vitest";
import { calibrationResult, recordRung, startCalibration } from "./calibration";
import { DEFAULT_PEDAGOGY_CONFIG } from "./config";
import {
  activeSessionFor,
  applyAttempt,
  completeOnboarding,
  completeSessionItem,
  createProfile,
  endSession,
  setExperience,
  setKeyboardLayout,
  startSession,
  type FinishedAttempt,
} from "./profile";
import type { DailySession } from "./session";
import { EMPTY_GAMIFICATION } from "./gamification";
import { EMPTY_LEARNER } from "./types";
import { DAY_MS, T0, exerciseFor, skillOf } from "./test-util";

const skills = [skillOf("vim.a"), skillOf("vim.b", ["vim.a"], 2)];
const a = exerciseFor("ex-a", ["vim.a"], { language: "javascript" });

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
const finished = (
  overrides: Partial<FinishedAttempt["metrics"]> = {},
  at = T0,
): FinishedAttempt => ({
  exercise: a,
  metrics: { ...metrics, ...overrides },
  at,
});

const plan: DailySession = {
  userId: "u",
  date: "2026-01-01",
  seed: "",
  warmup: [],
  reviews: [],
  learn: [{ exerciseId: "ex-a", skillId: "vim.a", block: "learn", reason: "test" }],
  mixed: [],
  challenge: [],
};

describe("profile basics", () => {
  it("starts empty, not onboarded, on the US layout", () => {
    expect(createProfile("u", T0)).toEqual({
      version: 2,
      userId: "u",
      createdAt: T0,
      settings: { keyboardLayout: "us-ansi" },
      onboarding: { completed: false, experience: null, calibration: null, completedAt: null },
      learner: EMPTY_LEARNER,
      history: [],
      personalBests: {},
      activeSession: null,
      sessions: [],
      gamification: EMPTY_GAMIFICATION,
    });
  });

  it("keeps the layout and the self-reported experience as settings, not as evidence", () => {
    let profile = createProfile("u", T0);
    profile = setKeyboardLayout(setExperience(profile, "regular"), "es-iso");
    expect(profile.settings.keyboardLayout).toBe("es-iso");
    expect(profile.onboarding.experience).toBe("regular");
    // Saying "I use Vim regularly" earns no mastery and unlocks nothing by itself.
    expect(profile.learner).toBe(EMPTY_LEARNER);
    expect(profile.history).toEqual([]);

    const finished = completeOnboarding(profile, skills, null, T0 + 1000);
    expect(finished.onboarding).toMatchObject({
      completed: true,
      experience: "regular",
      completedAt: T0 + 1000,
    });
    expect(finished.learner).toBe(EMPTY_LEARNER);
  });

  it("turns the calibration estimate into a placement: dependents unlock, but no evidence or mastery is granted", () => {
    const ladder = [
      skillOf("vim.mode.normal"),
      skillOf("vim.navigation.atomic", ["vim.mode.normal"]),
      skillOf("vim.mode.insert", ["vim.mode.normal"]),
      skillOf("vim.navigation.words", ["vim.navigation.atomic"], 2),
      skillOf("vim.operator.delete", ["vim.navigation.words"], 3),
      skillOf("vim.repeat", ["vim.operator.delete"], 4),
    ];
    const calibration = calibrationResult(recordRung(startCalibration("regular"), 3, true));
    const profile = completeOnboarding(createProfile("u", T0), ladder, calibration, T0 + 1000);

    expect(profile.learner.placed).toEqual([
      "vim.mode.insert",
      "vim.mode.normal",
      "vim.navigation.atomic",
      "vim.navigation.words",
      "vim.operator.delete",
    ]);
    // The skill that builds on the top rung is open for learning; nothing has a single attempt.
    expect(profile.learner.skills["vim.repeat"]?.stage).toBe("learning");
    const entries = Object.values(profile.learner.skills);
    expect(entries.every((skill) => skill.attemptCount === 0 && skill.mastery === 0)).toBe(true);
    expect(entries.every((skill) => skill.stage === "learning")).toBe(true);
    expect(profile.history).toEqual([]);
  });

  it("does not place the learner past a rung that failed", () => {
    const failed = calibrationResult(recordRung(startCalibration("never"), 0, false));
    expect(completeOnboarding(createProfile("u", T0), skills, failed, T0).learner).toBe(
      EMPTY_LEARNER,
    );
  });
});

describe("applying an attempt", () => {
  it("updates skill evidence, history and personal bests together", () => {
    const first = applyAttempt(createProfile("u", T0), skills, finished());
    expect(first.profile.learner.skills["vim.a"]?.attemptCount).toBe(1);
    expect(first.profile.history).toEqual([
      { exerciseId: "ex-a", skillIds: ["vim.a"], at: T0, success: true, performance: 90 },
    ]);
    expect(first.profile.personalBests["ex-a"]).toEqual({
      time: 2000,
      efficiency: 100,
      performance: 90,
      reaction: 400,
    });
    expect(first.improved).toEqual([]);
    expect(first.updates.map((update) => update.skillId)).toEqual(["vim.a"]);

    const second = applyAttempt(
      first.profile,
      skills,
      finished({ totalDurationMs: 1500 }, T0 + 60_000),
    );
    expect(second.improved).toEqual(["time"]);
    expect(second.profile.personalBests["ex-a"]?.time).toBe(1500);
    expect(second.profile.history).toHaveLength(2);
  });

  it("does not mutate the previous profile", () => {
    const before = createProfile("u", T0);
    const snapshot = structuredClone(before);
    applyAttempt(before, skills, finished());
    expect(before).toEqual(snapshot);
  });

  it("bounds the stored history", () => {
    const config = {
      ...DEFAULT_PEDAGOGY_CONFIG,
      profile: { ...DEFAULT_PEDAGOGY_CONFIG.profile, maxHistory: 3 },
    };
    let profile = createProfile("u", T0);
    for (let i = 0; i < 5; i++) {
      profile = applyAttempt(profile, skills, finished({}, T0 + i * 60_000), config).profile;
    }
    expect(profile.history.map((entry) => entry.at)).toEqual([
      T0 + 2 * 60_000,
      T0 + 3 * 60_000,
      T0 + 4 * 60_000,
    ]);
  });
});

describe("daily session lifecycle", () => {
  const options = { exerciseIdsForSkill: () => ["ex-a"], skillsOf: () => ["vim.a"] };
  const result = {
    success: true,
    performance: 90,
    at: T0,
    scheduledReview: false,
    improved: [],
    skillUpdates: [],
  } as const;

  it("starts, advances and ends a session", () => {
    let profile = startSession(createProfile("u", T0), plan, T0);
    expect(activeSessionFor(profile, "2026-01-01")?.run.pending).toHaveLength(1);

    profile = completeSessionItem(profile, result, options);
    expect(profile.activeSession?.run.completed).toHaveLength(1);

    profile = endSession(profile, T0 + 5000, false);
    expect(profile.activeSession).toBeNull();
    expect(profile.sessions).toEqual([
      {
        date: "2026-01-01",
        startedAt: T0,
        finishedAt: T0 + 5000,
        exercises: 1,
        successes: 1,
        reviewsCompleted: 0,
        abandoned: false,
        xp: expect.any(Number),
      },
    ]);
  });

  it("does not resume a session from an earlier day", () => {
    const profile = startSession(createProfile("u", T0), plan, T0);
    expect(activeSessionFor(profile, "2026-01-02")).toBeNull();
  });

  it("records an abandoned session only if something was played", () => {
    const untouched = endSession(startSession(createProfile("u", T0), plan, T0), T0 + DAY_MS, true);
    expect(untouched.sessions).toEqual([]);
    expect(untouched.activeSession).toBeNull();

    const played = completeSessionItem(
      startSession(createProfile("u", T0), plan, T0),
      result,
      options,
    );
    expect(endSession(played, T0 + DAY_MS, true).sessions).toMatchObject([
      { exercises: 1, abandoned: true },
    ]);
  });

  it("does nothing without an active session", () => {
    const profile = createProfile("u", T0);
    expect(completeSessionItem(profile, result, options)).toBe(profile);
    expect(endSession(profile, T0, false)).toBe(profile);
  });
});
