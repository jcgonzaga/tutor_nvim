import { describe, expect, it } from "vitest";
import { planExplanation } from "./explain";

const evaluation = (success: boolean, performanceScore: number, ids: string[] = []) => ({
  success,
  antiPatterns: ids.map((id) => ({ id, count: 3, sequences: [1, 2, 3] })) as never,
  metrics: { performanceScore },
});

describe("planExplanation", () => {
  it("explains an exercise that was not solved, whatever the score", () => {
    expect(planExplanation(evaluation(false, 95)).reason).toBe("unsolved");
  });

  it("explains a solved exercise whose score is 50 or lower", () => {
    expect(planExplanation(evaluation(true, 50)).reason).toBe("low-score");
    expect(planExplanation(evaluation(true, 12)).reason).toBe("low-score");
  });

  it("stays quiet above 50", () => {
    expect(planExplanation(evaluation(true, 50.1))).toEqual({ reason: null, antiPatterns: [] });
    expect(planExplanation(evaluation(true, 100))).toEqual({ reason: null, antiPatterns: [] });
  });

  it("lists each detected habit once, only when it explains", () => {
    const plan = planExplanation(evaluation(true, 30, ["repeated_x", "arrow_keys", "repeated_x"]));
    expect(plan.antiPatterns).toEqual(["repeated_x", "arrow_keys"]);
    expect(planExplanation(evaluation(true, 90, ["repeated_x"])).antiPatterns).toEqual([]);
  });

  it("takes the threshold from configuration", () => {
    expect(planExplanation(evaluation(true, 70), { maxScore: 75 }).reason).toBe("low-score");
  });
});
