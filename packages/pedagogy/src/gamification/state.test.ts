import { describe, expect, it } from "vitest";
import {
  EMPTY_GAMIFICATION,
  addXp,
  rememberBestRun,
  rememberRecentBest,
  xpOn,
  type RunRecord,
} from "./state";

const run = (performance: number, keys = ["x"]): RunRecord => ({
  keys,
  times: keys.map((_, i) => (i + 1) * 100),
  durationMs: keys.length * 100,
  performance,
  at: 1,
});

describe("game state", () => {
  it("adds XP to the lifetime total and, for attempts, to the day's cap", () => {
    const state = addXp(addXp(EMPTY_GAMIFICATION, "2026-10-21", 10, true), "2026-10-21", 5, true);
    expect(state.xp).toBe(15);
    expect(xpOn(state, "2026-10-21")).toBe(15);
  });

  it("keeps the daily bonus out of the cap", () => {
    const state = addXp(EMPTY_GAMIFICATION, "2026-10-21", 20, false);
    expect(state.xp).toBe(20);
    expect(xpOn(state, "2026-10-21")).toBe(0);
  });

  it("ignores zero and negative amounts", () => {
    expect(addXp(EMPTY_GAMIFICATION, "2026-10-21", 0, true)).toBe(EMPTY_GAMIFICATION);
    expect(addXp(EMPTY_GAMIFICATION, "2026-10-21", -3, true)).toBe(EMPTY_GAMIFICATION);
  });

  it("forgets old days so the profile stays small, but never loses lifetime XP", () => {
    let state = EMPTY_GAMIFICATION;
    for (let day = 1; day <= 20; day++) {
      state = addXp(state, `2026-10-${String(day).padStart(2, "0")}`, 5, true);
    }
    expect(Object.keys(state.xpByDay)).toHaveLength(14);
    expect(state.xpByDay["2026-10-01"]).toBeUndefined();
    expect(state.xp).toBe(100);
  });

  it("keeps the better run of an exercise, by performance", () => {
    const first = rememberBestRun(EMPTY_GAMIFICATION, "ex", run(70, ["a", "b", "c"]));
    const worse = rememberBestRun(first, "ex", run(60, ["x"]));
    const better = rememberBestRun(first, "ex", run(90, ["y"]));
    expect(worse).toBe(first);
    expect(better.bestRuns.ex?.keys).toEqual(["y"]);
  });

  it("remembers recent bests, newest last, and only real ones", () => {
    let state = EMPTY_GAMIFICATION;
    for (let i = 0; i < 8; i++) {
      state = rememberRecentBest(state, { exerciseId: `e${i}`, metrics: ["time"], at: i });
    }
    expect(state.recentBests.map((b) => b.exerciseId)).toEqual(["e3", "e4", "e5", "e6", "e7"]);
    expect(rememberRecentBest(state, { exerciseId: "none", metrics: [], at: 9 })).toBe(state);
  });
});
