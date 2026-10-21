import { describe, expect, it } from "vitest";
import { EMPTY_COMBO, updateCombo, type ComboFacts } from "./combo";

const good: ComboFacts = { success: true, strategy: "optimal", maxHintLevel: 0, antiPatterns: 0 };
const run = (facts: ComboFacts[], start = EMPTY_COMBO) =>
  facts.reduce((state, f) => updateCombo(state, f).state, start);

describe("combo (T-802)", () => {
  it("grows with consecutive high-quality executions", () => {
    expect(run([good, good, good])).toEqual({ current: 3, best: 3 });
    expect(updateCombo(EMPTY_COMBO, good).change).toEqual({ kind: "increased" });
  });

  it("counts efficient and valid solutions as good ones", () => {
    expect(
      run([
        { ...good, strategy: "efficient" },
        { ...good, strategy: "valid" },
      ]).current,
    ).toBe(2);
  });

  it("resets on a failure, and remembers the best", () => {
    const result = updateCombo(run([good, good, good]), {
      ...good,
      success: false,
      strategy: "failed",
    });
    expect(result.state).toEqual({ current: 0, best: 3 });
    expect(result.change).toEqual({ kind: "reset", reason: "failed" });
  });

  it("resets on a strong hint but not on a gentle one", () => {
    const three = run([good, good, good]);
    expect(updateCombo(three, { ...good, maxHintLevel: 2 }).change).toEqual({
      kind: "reset",
      reason: "strong-hint",
    });
    expect(updateCombo(three, { ...good, maxHintLevel: 1 }).state.current).toBe(4);
  });

  it("resets on an anti-pattern, even if the exercise was solved", () => {
    const three = run([good, good, good]);
    expect(updateCombo(three, { ...good, antiPatterns: 1 }).change).toEqual({
      kind: "reset",
      reason: "anti-pattern",
    });
    expect(updateCombo(three, { ...good, strategy: "anti-pattern" }).state.current).toBe(0);
  });

  it("holds on a correct but inefficient solution: it neither grows nor breaks", () => {
    const two = run([good, good]);
    const held = updateCombo(two, { ...good, strategy: "inefficient" });
    expect(held.state).toEqual(two);
    expect(held.change).toEqual({ kind: "held" });
  });

  it("starts again after a reset, keeping the best of the run", () => {
    const state = run([good, good, { ...good, success: false, strategy: "failed" }, good]);
    expect(state).toEqual({ current: 1, best: 2 });
  });

  it("prefers the failure as the reason when several apply", () => {
    const result = updateCombo(EMPTY_COMBO, {
      success: false,
      strategy: "failed",
      maxHintLevel: 3,
      antiPatterns: 2,
    });
    expect(result.change).toEqual({ kind: "reset", reason: "failed" });
  });

  it("knows nothing about time: speed alone cannot build a combo", () => {
    expect(Object.keys(good).sort()).toEqual([
      "antiPatterns",
      "maxHintLevel",
      "strategy",
      "success",
    ]);
  });
});
