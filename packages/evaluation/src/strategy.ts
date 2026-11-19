import type {
  Exercise,
  SolutionClassification,
  WorkspaceSolutionAction,
} from "@tutor-nvim/exercise-schema";
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
  /**
   * The cheapest declared solution, in the attempt's own unit: keystrokes for the Vim and shell
   * simulators, actions for the workspace (`optimalCost`). It is one scale for every kind.
   */
  readonly optimalKeystrokes: number;
  readonly config: StrategyConfig;
}

/** A rule decides the classification, or returns `null` to defer to the next rule. */
export type StrategyRule = (context: StrategyContext) => StrategyClassification | null;

/**
 * `reference / actual` against `efficiencyBands`, the one efficiency scale in the application.
 *
 * Exported because an action attempt (S6) compares the keys it spent against the cheapest layer's
 * cost with the same bands, instead of keeping a second scale that could drift from this one.
 */
export function efficiencyClassification(
  referenceKeystrokes: number,
  keystrokes: number,
  bands: StrategyConfig["efficiencyBands"],
): StrategyClassification {
  const ratio = keystrokes === 0 ? 0 : referenceKeystrokes / keystrokes;
  if (ratio >= bands.optimal) return "optimal";
  if (ratio >= bands.efficient) return "efficient";
  if (ratio >= bands.valid) return "valid";
  return "inefficient";
}

const failedRule: StrategyRule = ({ success }) => (success ? null : "failed");

/** The same action, target included: `diw` and `daw` are different turns of the same verb. */
const sameAction = (a: WorkspaceSolutionAction, b: WorkspaceSolutionAction): boolean =>
  a.action === b.action && a.target === b.target;

const sameActions = (
  a: readonly WorkspaceSolutionAction[],
  b: readonly WorkspaceSolutionAction[],
): boolean => a.length === b.length && a.every((action, index) => sameAction(action, b[index]!));

/**
 * The author's word wins: an exact declared run takes the classification it was declared with —
 * keys for the simulators, actions for the workspace (S5 writes those solutions as actions).
 */
const declaredSolutionRule: StrategyRule = ({ exercise, attempt }) => {
  if (attempt.kind === "workspace") {
    if (exercise.kind !== "workspace") return null;
    return (
      exercise.solutions.find((solution) => sameActions(solution.actions, attempt.actions))
        ?.classification ?? null
    );
  }
  // A mismatch (a Vim attempt against workspace content) has no key solution to match.
  if (exercise.kind === "workspace") return null;
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

/** What the attempt spent: keystrokes, or actions in the workspace (where no key was typed). */
const attemptCost = (attempt: Attempt): number =>
  attempt.kind === "workspace" ? attempt.actions.length : attempt.events.length;

const efficiencyRule: StrategyRule = ({ attempt, optimalKeystrokes, config }) =>
  efficiencyClassification(optimalKeystrokes, attemptCost(attempt), config.efficiencyBands);

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
