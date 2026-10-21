import { describe, expect, it } from "vitest";
import {
  EMPTY_STREAK,
  completedToday,
  currentStreak,
  dayDiff,
  recordCompletedDay,
  type StreakState,
} from "./streak";

const run = (days: string[], start: StreakState = EMPTY_STREAK) =>
  days.reduce((state, day) => recordCompletedDay(state, day), start);

describe("dayDiff", () => {
  it("counts calendar days across months, years and leap days", () => {
    expect(dayDiff("2026-01-31", "2026-02-01")).toBe(1);
    expect(dayDiff("2025-12-31", "2026-01-01")).toBe(1);
    expect(dayDiff("2028-02-28", "2028-03-01")).toBe(2);
    expect(dayDiff("2026-03-01", "2026-03-01")).toBe(0);
    expect(dayDiff("2026-03-05", "2026-03-01")).toBe(-4);
  });

  it("is not thrown off by daylight saving changes", () => {
    expect(dayDiff("2026-03-28", "2026-03-30")).toBe(2);
    expect(dayDiff("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("daily streak (T-803)", () => {
  it("starts at 1 with the first completed day", () => {
    expect(run(["2026-10-21"])).toEqual({ current: 1, longest: 1, lastDay: "2026-10-21" });
  });

  it("grows one per consecutive day", () => {
    expect(run(["2026-10-21", "2026-10-22", "2026-10-23"]).current).toBe(3);
  });

  it("counts a day once, however many sessions are completed", () => {
    expect(run(["2026-10-21", "2026-10-21", "2026-10-21"]).current).toBe(1);
  });

  it("forgives one missed day: a streak is motivation, not a trap", () => {
    expect(run(["2026-10-21", "2026-10-23"]).current).toBe(2);
    expect(run(["2026-10-21", "2026-10-23", "2026-10-25"]).current).toBe(3);
  });

  it("starts over after a longer gap, and keeps the longest", () => {
    const state = run(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-27"]);
    expect(state).toEqual({ current: 1, longest: 3, lastDay: "2026-10-27" });
  });

  it("ignores a day before the last one (a clock set back) instead of punishing it", () => {
    const state = run(["2026-10-21", "2026-10-22"]);
    expect(recordCompletedDay(state, "2026-10-19")).toBe(state);
  });

  it("works across a month and a year boundary", () => {
    expect(run(["2026-12-30", "2026-12-31", "2027-01-01"]).current).toBe(3);
  });

  it("can be tuned: no grace means a missed day breaks it", () => {
    const strict = { ...EMPTY_STREAK };
    const config = { streak: { graceDays: 0 } } as never;
    const first = recordCompletedDay(strict, "2026-10-21", config);
    expect(recordCompletedDay(first, "2026-10-23", config).current).toBe(1);
  });
});

describe("the streak shown today", () => {
  const state = run(["2026-10-21", "2026-10-22"]);

  it("is the streak while it can still be continued", () => {
    expect(currentStreak(state, "2026-10-22")).toBe(2);
    expect(currentStreak(state, "2026-10-23")).toBe(2);
    expect(currentStreak(state, "2026-10-24")).toBe(2);
  });

  it("is 0 once it lapsed, while the longest stays", () => {
    expect(currentStreak(state, "2026-10-25")).toBe(0);
    expect(state.longest).toBe(2);
  });

  it("is 0 for someone who never completed a session", () => {
    expect(currentStreak(EMPTY_STREAK, "2026-10-21")).toBe(0);
  });

  it("knows whether today already counted", () => {
    expect(completedToday(state, "2026-10-22")).toBe(true);
    expect(completedToday(state, "2026-10-23")).toBe(false);
  });
});
