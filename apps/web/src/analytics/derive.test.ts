import { describe, expect, it } from "vitest";
import type { AttemptEvaluation } from "@tutor-nvim/evaluation";
import type { Profile } from "@tutor-nvim/pedagogy";
import { eventsForAttempt, eventsForCompletedSession } from "./derive";
import { EVENT_NAMES } from "./events";

type Stage = "locked" | "learning" | "practicing" | "fluent" | "mastered";

const profile = (stages: Record<string, Stage>): Profile =>
  ({
    learner: {
      skills: Object.fromEntries(Object.entries(stages).map(([id, stage]) => [id, { stage }])),
    },
  }) as unknown as Profile;

const evaluation = (success: boolean): AttemptEvaluation =>
  ({
    success,
    strategy: "optimal",
    metrics: { performanceScore: 91.6, totalDurationMs: 2345.4, hintsUsed: 1 },
  }) as unknown as AttemptEvaluation;

const base = {
  exercise: { id: "ex-1" },
  keystrokes: 7,
  result: { improved: [], updates: [] },
} as const;

describe("analytics events derived from an attempt", () => {
  it("reports a completed exercise with rounded metrics and no typed content", () => {
    const events = eventsForAttempt({
      ...base,
      evaluation: evaluation(true),
      feedback: "perfect",
      before: profile({ a: "learning" }),
      after: profile({ a: "learning" }),
    });
    expect(events).toEqual([
      {
        name: "exercise_completed",
        props: {
          exerciseId: "ex-1",
          feedback: "perfect",
          strategy: "optimal",
          performance: 92,
          durationMs: 2345,
          keystrokes: 7,
          hintsUsed: 1,
        },
      },
    ]);
  });

  it("reports a failed exercise, also when the learner gave up on a solved buffer", () => {
    for (const [success, feedback] of [
      [false, "failed"],
      [true, "failed"],
    ] as const) {
      const [event] = eventsForAttempt({
        ...base,
        evaluation: evaluation(success),
        feedback,
        before: profile({}),
        after: profile({}),
      });
      expect(event?.name).toBe("exercise_failed");
    }
  });

  it("finds unlocks, mastery, reviews and personal bests by comparing profiles", () => {
    const events = eventsForAttempt({
      exercise: { id: "ex-1" },
      keystrokes: 4,
      evaluation: evaluation(true),
      feedback: "completed",
      before: profile({ a: "fluent", b: "locked", c: "learning" }),
      after: profile({ a: "mastered", b: "learning", c: "learning" }),
      result: {
        improved: ["keystrokes"],
        updates: [{ skillId: "a", scheduledReview: true }],
      } as never,
    });
    expect(events.map((event) => event.name)).toEqual([
      "exercise_completed",
      "review_completed",
      "personal_best",
      "skill_mastered",
      "skill_unlocked",
    ]);
    expect(events.find((event) => event.name === "skill_unlocked")?.props).toEqual({
      skillId: "b",
    });
  });

  it("does not repeat an unlock or mastery that already happened", () => {
    const events = eventsForAttempt({
      ...base,
      evaluation: evaluation(true),
      feedback: "completed",
      before: profile({ a: "mastered", b: "learning" }),
      after: profile({ a: "mastered", b: "practicing" }),
    });
    expect(events.map((event) => event.name)).toEqual(["exercise_completed"]);
  });
});

describe("analytics events of a finished session", () => {
  const summary = { exercises: 5, successes: 4, xp: 120 };

  it("adds the daily bonus to the XP and reports the streak once a day", () => {
    const events = eventsForCompletedSession({
      summary,
      rewards: { dailyBonusXp: 30, streak: 3, longestStreak: 5, firstOfDay: true },
    });
    expect(events).toEqual([
      {
        name: "session_completed",
        props: { exercises: 5, successes: 4, xp: 150, streak: 3 },
      },
      { name: "daily_streak", props: { streak: 3, longest: 5 } },
    ]);
  });

  it("does not report a streak for a second session in the same day", () => {
    const events = eventsForCompletedSession({
      summary,
      rewards: { dailyBonusXp: 0, streak: 3, longestStreak: 5, firstOfDay: false },
    });
    expect(events.map((event) => event.name)).toEqual(["session_completed"]);
  });
});

describe("catalogue", () => {
  it("lists the events the plan requires", () => {
    expect([...EVENT_NAMES].sort()).toEqual(
      [
        "daily_streak",
        "exercise_completed",
        "exercise_failed",
        "exercise_started",
        "hint_used",
        "personal_best",
        "review_completed",
        "session_completed",
        "session_started",
        "skill_mastered",
        "skill_unlocked",
      ].sort(),
    );
  });
});
