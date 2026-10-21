import { describe, expect, it } from "vitest";
import { updatePersonalBest, type BestInput, type PersonalBest } from "./personalBest";

const attempt = (overrides: Partial<BestInput> = {}): BestInput => ({
  success: true,
  totalDurationMs: 2000,
  efficiencyScore: 80,
  performanceScore: 75,
  firstInputLatencyMs: 500,
  ...overrides,
});

describe("personal bests", () => {
  it("the first success sets the baseline without counting as a record", () => {
    const { best, improved } = updatePersonalBest(undefined, attempt());
    expect(best).toEqual({ time: 2000, efficiency: 80, performance: 75, reaction: 500 });
    expect(improved).toEqual([]);
  });

  it("lower is better for time and reaction, higher for efficiency and performance", () => {
    const first = updatePersonalBest(undefined, attempt()).best;
    const { best, improved } = updatePersonalBest(
      first,
      attempt({
        totalDurationMs: 1500,
        efficiencyScore: 90,
        performanceScore: 70,
        firstInputLatencyMs: 600,
      }),
    );
    expect(improved).toEqual(["time", "efficiency"]);
    expect(best).toEqual({ time: 1500, efficiency: 90, performance: 75, reaction: 500 });
  });

  it("an equal result is not a record", () => {
    const first = updatePersonalBest(undefined, attempt()).best;
    expect(updatePersonalBest(first, attempt()).improved).toEqual([]);
  });

  it("ignores failed attempts, however fast", () => {
    const first = updatePersonalBest(undefined, attempt()).best;
    const failed = updatePersonalBest(
      first,
      attempt({ success: false, totalDurationMs: 1, performanceScore: 100 }),
    );
    expect(failed.best).toBe(first);
    expect(failed.improved).toEqual([]);
  });

  it("skips reaction when no input was timed", () => {
    const first: PersonalBest = { time: 2000, efficiency: 80, performance: 75, reaction: 500 };
    expect(updatePersonalBest(first, attempt({ firstInputLatencyMs: null })).improved).toEqual([]);
  });

  it("can set a baseline for a metric that earlier had none", () => {
    const first = updatePersonalBest(undefined, attempt({ firstInputLatencyMs: null })).best;
    const next = updatePersonalBest(first, attempt({ firstInputLatencyMs: 400 }));
    expect(next.best.reaction).toBe(400);
    expect(next.improved).toEqual([]); // a first value is a baseline, not a record
  });
});
