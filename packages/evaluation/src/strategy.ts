import type { Exercise, SolutionClassification } from "@tutor-nvim/exercise-schema";
import type { Attempt } from "./attempt";
import type { AntiPatternHit } from "./antipatterns";

export type StrategyClassification = SolutionClassification | "failed";

/**
 * Keystroke-efficiency bands for attempts that do not match a declared solution:
 * `optimalKeystrokes / keystrokes` at or above `optimal` is optimal, and so on down.
 * Rejected inputs count as keystrokes, so wasted keys lower the ratio.
 */
export interface StrategyConfig {
  readonly efficiencyBands: {
    readonly optimal: number;
    readonly efficient: number;
    readonly valid: number;
  };
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  efficiencyBands: { optimal: 1, efficient: 0.7, valid: 0.4 },
};

export interface StrategyContext {
  readonly exercise: Exercise;
  readonly attempt: Attempt;
  readonly success: boolean;
  readonly antiPatterns: readonly AntiPatternHit[];
  readonly optimalKeystrokes: number;
  readonly config: StrategyConfig;
}

/** A rule decides the classification, or returns `null` to defer to the next rule. */
export type StrategyRule = (context: StrategyContext) => StrategyClassification | null;

const failedRule: StrategyRule = ({ success }) => (success ? null : "failed");

/** The author's word wins: an exact declared sequence takes the classification it was declared with. */
const declaredSolutionRule: StrategyRule = ({ exercise, attempt }) => {
  const typed = attempt.events.map((event) => event.logicalKey);
  const match = exercise.solutions.find(
    (solution) =>
      solution.keys.length === typed.length &&
      solution.keys.every((key, index) => key === typed[index]),
  );
  return match?.classification ?? null;
};

/** Solved the task, but with a habit the exercise wants to discourage. */
const antiPatternRule: StrategyRule = ({ antiPatterns }) =>
  antiPatterns.length > 0 ? "anti-pattern" : null;

const efficiencyRule: StrategyRule = ({ attempt, optimalKeystrokes, config }) => {
  const keystrokes = attempt.events.length;
  const ratio = keystrokes === 0 ? 0 : optimalKeystrokes / keystrokes;
  const { optimal, efficient, valid } = config.efficiencyBands;
  if (ratio >= optimal) return "optimal";
  if (ratio >= efficient) return "efficient";
  if (ratio >= valid) return "valid";
  return "inefficient";
};

/** Rules run in order; the first one with an opinion decides. Extend or reorder by passing your own list. */
export const DEFAULT_STRATEGY_RULES: readonly StrategyRule[] = [
  failedRule,
  declaredSolutionRule,
  antiPatternRule,
  efficiencyRule,
];

export function classifyStrategy(
  context: StrategyContext,
  rules: readonly StrategyRule[] = DEFAULT_STRATEGY_RULES,
): StrategyClassification {
  for (const rule of rules) {
    const classification = rule(context);
    if (classification !== null) return classification;
  }
  return context.success ? "valid" : "failed";
}
