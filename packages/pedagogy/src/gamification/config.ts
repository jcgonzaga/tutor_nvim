/**
 * Every tunable of the game layer (AGENTS 2.4). It is deliberately separate from
 * `PedagogyConfig`: XP, combo and streak measure participation and never feed mastery (AGENTS 2.7).
 */
export interface GamificationConfig {
  readonly xp: {
    /** For solving an exercise at all. A failed attempt earns nothing. */
    readonly completion: number;
    /** Solved with the best strategy, no errors and no hints (feedback "perfect"). */
    readonly perfectBonus: number;
    /** The attempt was the scheduled review of a skill that was due. */
    readonly scheduledReviewBonus: number;
    /** The attempt was transfer evidence: a skill solved in a context it had not been before. */
    readonly transferBonus: number;
    /** Per improved personal-best metric. */
    readonly personalBestBonus: number;
    /** At most this many improved metrics are paid per attempt. */
    readonly maxPersonalBestMetrics: number;
    /** Once per day, for finishing the daily session. */
    readonly dailyCompletionBonus: number;
    /** Fraction of the completion XP lost per hint used (never below zero). */
    readonly hintPenalty: number;
    /**
     * Anti-farming: the Nth success at the same exercise on the same day pays this fraction of the
     * normal XP (index 0 is the first success). Past the end of the list it pays nothing.
     */
    readonly repeatFactors: readonly number[];
    /** Attempt XP stops at this much per day. The daily completion bonus is not counted. */
    readonly dailyCap: number;
    /** Extra XP fraction per combo step above 1, up to `comboBonusMax`. */
    readonly comboBonusPerStep: number;
    readonly comboBonusMax: number;
  };
  readonly combo: {
    /** Using a hint of this level or stronger resets the combo (PRD 33: "hint fuerte"). */
    readonly strongHintLevel: number;
  };
  readonly streak: {
    /**
     * Whole days that can be missed without losing the streak (PRD 33: motivational, never a
     * threat). With 1, a streak survives skipping one day between two completed sessions.
     */
    readonly graceDays: number;
  };
  readonly level: {
    /** XP needed to go from level L to L+1 is `round(base * L ^ growth)`. */
    readonly base: number;
    readonly growth: number;
  };
  /** Bounds of what a stored profile keeps. */
  readonly keep: {
    readonly xpDays: number;
    readonly recentBests: number;
  };
}

export const DEFAULT_GAMIFICATION_CONFIG: GamificationConfig = {
  xp: {
    completion: 10,
    perfectBonus: 5,
    scheduledReviewBonus: 6,
    transferBonus: 8,
    personalBestBonus: 3,
    maxPersonalBestMetrics: 2,
    dailyCompletionBonus: 20,
    hintPenalty: 0.25,
    repeatFactors: [1, 0.5, 0.25],
    dailyCap: 400,
    comboBonusPerStep: 0.05,
    comboBonusMax: 0.25,
  },
  combo: { strongHintLevel: 2 },
  streak: { graceDays: 1 },
  level: { base: 100, growth: 1.3 },
  keep: { xpDays: 14, recentBests: 5 },
};
