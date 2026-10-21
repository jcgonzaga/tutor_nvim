import { describe, expect, it } from "vitest";
import { evaluateAttempt } from "./evaluate";
import {
  DEFAULT_STRATEGY_CONFIG,
  DEFAULT_STRATEGY_RULES,
  classifyStrategy,
  type StrategyContext,
  type StrategyRule,
} from "./strategy";
import { optimalKeystrokes } from "./antipatterns";
import { exerciseWith, play } from "./test-util";

/** `x x x x x` removes "very ", the same as the optimal `dw`. */
const exercise = exerciseWith({
  initialState: { buffer: "const very long = 1;\n", cursor: { line: 1, column: 7 } },
  objective: { type: "buffer_equals", target: "const long = 1;\n" },
  evaluation: { requireFinalNormalMode: false },
  solutions: [
    { sequence: "dw", classification: "optimal" },
    { sequence: "xxxxx", classification: "anti-pattern" },
    { sequence: "dwix<Esc>x", classification: "inefficient" },
  ],
  antiPatterns: ["repeated_x"],
});

const strategyOf = (sequence: string) =>
  evaluateAttempt(exercise, play(exercise, sequence)).strategy;

describe("default strategy rules", () => {
  it("classifies an unsolved attempt as failed", () => {
    expect(strategyOf("w")).toBe("failed");
  });

  it("takes the classification declared for an exact solution", () => {
    expect(strategyOf("dw")).toBe("optimal");
    expect(strategyOf("xxxxx")).toBe("anti-pattern");
  });

  it("flags a habit the exercise warns about, even in an undeclared route", () => {
    // Deletes the same text with x presses plus a wasted motion: not declared, but repeated_x.
    const evaluation = evaluateAttempt(exercise, play(exercise, "hlxxxxx"));
    expect(evaluation.success).toBe(true);
    expect(evaluation.antiPatterns.map((hit) => hit.id)).toEqual(["repeated_x"]);
    expect(evaluation.strategy).toBe("anti-pattern");
  });

  it("grades undeclared clean routes by keystroke efficiency", () => {
    const plain = exerciseWith({
      initialState: { buffer: "a b c d e f g h i j\n", cursor: { line: 1, column: 1 } },
      objective: { type: "buffer_equals", target: "d e f g h i j\n" },
      evaluation: { requireFinalNormalMode: false },
      solutions: [{ sequence: "dwdwdw", classification: "optimal" }],
    });
    const strategy = (sequence: string) => evaluateAttempt(plain, play(plain, sequence)).strategy;

    // The optimal solution is 6 keys; every `lh` pair adds 2 keystrokes that change nothing.
    expect(strategy("wdwdwd")).toBe("failed"); // does not reach the goal
    expect(strategy("dwdwdw")).toBe("optimal"); // 6/6   = 1.00
    expect(strategy("lhdwdwdw")).toBe("efficient"); // 6/8   = 0.75
    expect(strategy("lhlhlhlhdwdwdw")).toBe("valid"); // 6/14  = 0.43
    expect(strategy("lh".repeat(10) + "dwdwdw")).toBe("inefficient"); // 6/26  = 0.23
  });

  it("counts rejected inputs as keystrokes, so wasted keys lower the grade", () => {
    const evaluation = evaluateAttempt(exercise, play(exercise, `${"z".repeat(10)}dw`));
    expect(evaluation.success).toBe(true);
    expect(evaluation.metrics.errors).toBe(10);
    expect(evaluation.strategy).toBe("inefficient");
  });
});

describe("rules are data", () => {
  const context = (sequence: string): StrategyContext => {
    const attempt = play(exercise, sequence);
    return {
      exercise,
      attempt,
      success: true,
      antiPatterns: [],
      optimalKeystrokes: optimalKeystrokes(exercise),
      config: DEFAULT_STRATEGY_CONFIG,
    };
  };

  it("the first rule with an opinion decides", () => {
    const always: StrategyRule = () => "inefficient";
    expect(classifyStrategy(context("dw"), [always, ...DEFAULT_STRATEGY_RULES])).toBe(
      "inefficient",
    );
    expect(classifyStrategy(context("dw"), [() => null, ...DEFAULT_STRATEGY_RULES])).toBe(
      "optimal",
    );
  });

  it("falls back to valid (solved) or failed (unsolved) when no rule decides", () => {
    expect(classifyStrategy(context("dw"), [])).toBe("valid");
    expect(classifyStrategy({ ...context("dw"), success: false }, [])).toBe("failed");
  });

  it("efficiency bands come from configuration", () => {
    const lenient = {
      ...context("lhdw"),
      config: { efficiencyBands: { optimal: 0.5, efficient: 0.3, valid: 0.1 } },
    };
    expect(classifyStrategy(lenient)).toBe("optimal");
  });

  it("is deterministic", () => {
    const first = classifyStrategy(context("lhdw"));
    expect(Array.from({ length: 5 }, () => classifyStrategy(context("lhdw")))).toEqual(
      Array(5).fill(first),
    );
  });
});
