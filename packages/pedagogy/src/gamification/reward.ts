import { updateCombo, type ComboResult, type ComboState } from "./combo";
import { DEFAULT_GAMIFICATION_CONFIG, type GamificationConfig } from "./config";
import { awardAttemptXp, type XpAward } from "./xp";

/**
 * Everything the game layer reads about one attempt. It is the whole input of a reward: facts about
 * the attempt and about the day so far, and no learner state of any kind (AGENTS 2.7).
 */
export interface AttemptRewardInput {
  readonly success: boolean;
  readonly feedback: "perfect" | "completed" | "failed";
  readonly strategy: "optimal" | "efficient" | "valid" | "inefficient" | "anti-pattern" | "failed";
  /** Highest hint level revealed; 0 when none. */
  readonly maxHintLevel: number;
  readonly hintsUsed: number;
  readonly antiPatterns: number;
  readonly scheduledReview: boolean;
  readonly transferEvidence: boolean;
  /** Personal-best metrics the attempt improved. */
  readonly personalBests: number;
  /** Earlier successes at this exercise on the same local day. */
  readonly priorCompletionsToday: number;
  /** Attempt XP already earned on the same local day. */
  readonly xpToday: number;
  /** The session's combo before this attempt. */
  readonly comboBefore: ComboState;
}

export interface AttemptReward {
  readonly award: XpAward;
  readonly combo: ComboResult;
}

/**
 * The single definition of what one attempt earns: the combo update, then the XP with that combo.
 * The device calls it to give feedback instantly and the server calls it to recompute the same
 * thing from the uploaded attempt, so both always agree and no client ever states its own XP.
 */
export function computeAttemptReward(
  input: AttemptRewardInput,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): AttemptReward {
  const combo = updateCombo(
    input.comboBefore,
    {
      success: input.success,
      strategy: input.strategy,
      maxHintLevel: input.maxHintLevel,
      antiPatterns: input.antiPatterns,
    },
    config,
  );
  const award = awardAttemptXp(
    {
      success: input.success,
      feedback: input.feedback,
      hintsUsed: input.hintsUsed,
      scheduledReview: input.scheduledReview,
      transferEvidence: input.transferEvidence,
      personalBests: input.personalBests,
      priorCompletionsToday: input.priorCompletionsToday,
      xpToday: input.xpToday,
      combo: Math.max(1, combo.state.current),
    },
    config,
  );
  return { award, combo };
}
