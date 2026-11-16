import { describe, expect, it } from "vitest";
import {
  applyAttempt,
  createProfile,
  recordRetryAttempt,
  startSession,
  type FinishedAttempt,
} from "./profile";
import type { DailySession, SessionItem } from "./session";
import { T0, exerciseFor, skillOf } from "./test-util";

const skills = [skillOf("vim.a"), skillOf("vim.b", ["vim.a"], 2)];
const a = exerciseFor("ex-a", ["vim.a"], { language: "javascript" });

/** What `evaluateAttempt(...).metrics` looks like for a solved and for an unsolved attempt. */
function metricsOf(success: boolean, totalDurationMs = 2000) {
  return {
    success,
    accuracyScore: success ? 100 : 0,
    strategyScore: success ? 100 : 0,
    fluencyScore: success ? 100 : 0,
    performanceScore: success ? 90 : 0,
    hintsUsed: 0,
    totalDurationMs,
    efficiencyScore: success ? 100 : 0,
    firstInputLatencyMs: success ? 400 : null,
  };
}

const finishedFor = (
  exercise: typeof a,
  success: boolean,
  at = T0,
  totalDurationMs = 2000,
): FinishedAttempt => ({ exercise, metrics: metricsOf(success, totalDurationMs), at });

const item = (exerciseId: string, skillId: string): SessionItem => ({
  exerciseId,
  skillId,
  block: "mixed",
  reason: "test",
});

/** Two items, so the run is still open after the first one. */
const plan: DailySession = {
  userId: "u",
  date: "2026-01-01",
  seed: "",
  warmup: [],
  reviews: [],
  learn: [],
  mixed: [item("ex-a", "vim.a"), item("ex-b", "vim.b")],
  challenge: [],
};

describe("recordRetryAttempt", () => {
  it("keeps the failed attempt in the history and appends the retry after it", () => {
    const failed = applyAttempt(createProfile("u", T0), skills, finishedFor(a, false));
    const retried = recordRetryAttempt(failed.profile, skills, finishedFor(a, true, T0 + 60_000));

    expect(retried.profile.history.map((entry) => entry.success)).toEqual([false, true]);
    expect(retried.profile.history.map((entry) => entry.at)).toEqual([T0, T0 + 60_000]);
  });

  it("grants no XP: the game layer stays exactly as it was", () => {
    const failed = applyAttempt(createProfile("u", T0), skills, finishedFor(a, false));
    const retried = recordRetryAttempt(failed.profile, skills, finishedFor(a, true, T0 + 60_000));

    expect(retried.profile.gamification).toEqual(failed.profile.gamification);
  });

  it("does not complete a session item again", () => {
    const failed = applyAttempt(createProfile("u", T0), skills, finishedFor(a, false));
    const running = startSession(failed.profile, plan, T0);
    const retried = recordRetryAttempt(running, skills, finishedFor(a, true, T0 + 60_000));

    expect(retried.profile.activeSession).toEqual(running.activeSession);
    expect(retried.profile.activeSession?.run.pending.map((entry) => entry.exerciseId)).toEqual([
      "ex-a",
      "ex-b",
    ]);
    expect(retried.profile.activeSession?.run.completed).toEqual([]);
  });

  it("counts as evidence: the retried success reaches the skill", () => {
    const failed = applyAttempt(createProfile("u", T0), skills, finishedFor(a, false));
    const retried = recordRetryAttempt(failed.profile, skills, finishedFor(a, true, T0 + 60_000));

    expect(retried.profile.learner.skills["vim.a"]?.attemptCount).toBe(2);
    expect(retried.profile.learner.skills["vim.a"]?.lastAttemptAt).toBe(T0 + 60_000);
    expect(retried.updates.map((update) => update.skillId)).toEqual(["vim.a"]);
  });

  it("a solved retry still counts as a personal best, like the same solve inside a session", () => {
    const failed = applyAttempt(createProfile("u", T0), skills, finishedFor(a, false));
    const retried = recordRetryAttempt(
      failed.profile,
      skills,
      finishedFor(a, true, T0 + 60_000, 1500),
    );

    expect(retried.profile.personalBests["ex-a"]).toEqual({
      time: 1500,
      efficiency: 100,
      performance: 90,
      reaction: 400,
    });
    // The failed attempt set no best, so the retry is the baseline, not a record (no "new PB").
    expect(retried.improved).toEqual([]);
  });

  it("does not mutate the profile it was given", () => {
    const running = startSession(createProfile("u", T0), plan, T0);
    const snapshot = structuredClone(running);
    recordRetryAttempt(running, skills, finishedFor(a, true, T0 + 60_000));
    expect(running).toEqual(snapshot);
  });
});
