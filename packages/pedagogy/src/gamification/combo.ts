import { DEFAULT_GAMIFICATION_CONFIG, type GamificationConfig } from "./config";

export interface ComboState {
  readonly current: number;
  /** Best combo reached in a single run of the game. */
  readonly best: number;
}

export const EMPTY_COMBO: ComboState = { current: 0, best: 0 };

/** The slice of an attempt the combo reads. */
export interface ComboFacts {
  readonly success: boolean;
  readonly strategy: "optimal" | "efficient" | "valid" | "inefficient" | "anti-pattern" | "failed";
  /** Highest hint level revealed during the attempt; 0 when none. */
  readonly maxHintLevel: number;
  /** Number of anti-patterns detected in the attempt. */
  readonly antiPatterns: number;
}

export type ComboChange =
  | { readonly kind: "increased" }
  | { readonly kind: "held" }
  | { readonly kind: "reset"; readonly reason: "failed" | "strong-hint" | "anti-pattern" };

export interface ComboResult {
  readonly state: ComboState;
  readonly change: ComboChange;
}

/**
 * Combo (T-802, PRD 33). It grows with consecutive high-quality executions and resets on a failure,
 * a strong hint, or an anti-pattern. A correct but inefficient solution neither grows nor breaks
 * it: the learner got there, just not well. It is not tied to speed, so rushing never builds a
 * combo (AGENTS 2.6).
 */
export function updateCombo(
  state: ComboState,
  facts: ComboFacts,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): ComboResult {
  // A "failed" strategy with success set is inconsistent input; the cautious reading is a failure.
  if (!facts.success || facts.strategy === "failed") return reset(state, "failed");
  if (facts.maxHintLevel >= config.combo.strongHintLevel) return reset(state, "strong-hint");
  if (facts.antiPatterns > 0 || facts.strategy === "anti-pattern") {
    return reset(state, "anti-pattern");
  }
  if (facts.strategy === "inefficient") return { state, change: { kind: "held" } };

  const current = state.current + 1;
  return { state: { current, best: Math.max(state.best, current) }, change: { kind: "increased" } };
}

function reset(state: ComboState, reason: "failed" | "strong-hint" | "anti-pattern"): ComboResult {
  return { state: { current: 0, best: state.best }, change: { kind: "reset", reason } };
}
