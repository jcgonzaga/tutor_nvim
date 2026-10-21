import { HOUR_MS } from "./math";
import type { MasteryStage } from "./types";

/**
 * Every tunable of the pedagogy engine in one place (AGENTS 2.4): thresholds and
 * weights are configuration, never constants buried in functions or the UI.
 */
export interface PedagogyConfig {
  readonly mastery: {
    /** PRD 28. Should add up to 1. */
    readonly weights: {
      readonly accuracy: number;
      readonly strategy: number;
      readonly fluency: number;
      readonly retention: number;
      readonly transfer: number;
    };
    /** Weight of a new sample in each dimension's moving average (0-1). */
    readonly learningRate: {
      readonly accuracy: number;
      readonly strategy: number;
      readonly fluency: number;
      readonly retention: number;
      readonly transfer: number;
    };
    /** Fraction of the accuracy evidence lost per hint used in an attempt. */
    readonly hintEvidencePenalty: number;
    /** Mastery is scaled down until this many attempts back it up. */
    readonly attemptsForFullConfidence: number;
    /**
     * Minimum time since the previous attempt of a skill for a new one to count as delayed
     * recall. Anything closer is same-session repetition and cannot raise retention.
     */
    readonly delayedRecallMinMs: number;
  };
  readonly stages: {
    readonly practicing: { readonly minAttempts: number; readonly minAccuracy: number };
    readonly fluent: {
      readonly minMastery: number;
      readonly minAccuracy: number;
      readonly minFluency: number;
    };
    /** PRD 29. */
    readonly mastered: {
      readonly minMastery: number;
      readonly minAccuracy: number;
      readonly minStrategy: number;
      readonly minTransfer: number;
      readonly minRetention: number;
      readonly minDelayedRecalls: number;
      readonly minTransfers: number;
    };
  };
  readonly unlock: {
    /** A prerequisite satisfies its dependents once it reached at least this stage. */
    readonly minPrerequisiteStage: MasteryStage;
  };
  readonly scheduler: {
    /** Cross-session interval ladder, in days (PRD 30). */
    readonly intervalsDays: readonly number[];
    /** In-session reappearance, counted in exercises: after a lapse, and after a shaky pass. */
    readonly inSession: { readonly afterLapse: number; readonly afterShakyPass: number };
    /** A performance score under this is a lapse. */
    readonly passMark: number;
    /** A pass under this performance is "shaky" and reappears within the session. */
    readonly solidMark: number;
    /** How soon a lapsed skill is due again. */
    readonly lapseRetryMs: number;
    /** An attempt this close to `dueAt` (or later) counts as the scheduled review. */
    readonly dueToleranceMs: number;
    /** Interval multiplier at the pass mark and at a perfect performance. */
    readonly minIntervalFactor: number;
    readonly maxIntervalFactor: number;
    /** Stability multiplier after a lapse. */
    readonly lapseStabilityFactor: number;
    /** An interval can grow at most this much past the previous stability. */
    readonly maxGrowth: number;
    readonly minStabilityDays: number;
    readonly maxStabilityDays: number;
    readonly initialDifficulty: number;
    readonly difficultyRate: number;
  };
  readonly priority: {
    readonly weights: {
      readonly reviewDue: number;
      readonly weakness: number;
      readonly prerequisiteNeed: number;
      readonly diversity: number;
      readonly transferNeed: number;
      readonly recentRepetition: number;
    };
    /** How many recent picks the positional penalties look back over. */
    readonly recentWindow: number;
    /** Each step back in the recent picks halves a penalty when this is 0.5. */
    readonly recentDecay: number;
    /** Hours after which a previously seen exercise is almost forgotten as a repeat. */
    readonly repetitionHalfLifeHours: number;
    /** Dependents a skill must block to reach full prerequisite need. */
    readonly blockedDependentsForFullNeed: number;
  };
  readonly session: {
    readonly counts: {
      readonly warmup: number;
      readonly reviews: number;
      readonly learn: number;
      readonly mixed: number;
      readonly challenge: number;
    };
    /** Stages whose skills are good warm-up material. */
    readonly warmupMinStage: MasteryStage;
    /** Seeded noise added to priorities so days vary without being random. */
    readonly jitter: number;
    /** Never repeat the same skill more than this many times in a row when an alternative exists. */
    readonly maxSameSkillRun: number;
    /** A skill that keeps lapsing comes back inside one session at most this many times. */
    readonly maxInSessionRepeats: number;
  };
  /** Bounds of what a stored profile keeps, so local storage cannot grow without limit. */
  readonly profile: {
    readonly maxHistory: number;
    readonly maxSessionSummaries: number;
  };
}

export const DEFAULT_PEDAGOGY_CONFIG: PedagogyConfig = {
  mastery: {
    weights: { accuracy: 0.3, strategy: 0.2, fluency: 0.2, retention: 0.2, transfer: 0.1 },
    learningRate: { accuracy: 0.4, strategy: 0.4, fluency: 0.4, retention: 0.5, transfer: 0.5 },
    hintEvidencePenalty: 0.25,
    attemptsForFullConfidence: 5,
    delayedRecallMinMs: 12 * HOUR_MS,
  },
  stages: {
    practicing: { minAttempts: 2, minAccuracy: 50 },
    fluent: { minMastery: 60, minAccuracy: 80, minFluency: 60 },
    mastered: {
      minMastery: 85,
      minAccuracy: 95,
      minStrategy: 85,
      minTransfer: 75,
      minRetention: 80,
      minDelayedRecalls: 1,
      minTransfers: 1,
    },
  },
  unlock: { minPrerequisiteStage: "practicing" },
  scheduler: {
    intervalsDays: [1, 3, 7, 14, 30],
    inSession: { afterLapse: 4, afterShakyPass: 12 },
    passMark: 60,
    solidMark: 80,
    lapseRetryMs: 10 * 60 * 1000,
    dueToleranceMs: 4 * HOUR_MS,
    minIntervalFactor: 0.6,
    maxIntervalFactor: 1.4,
    lapseStabilityFactor: 0.5,
    maxGrowth: 3,
    minStabilityDays: 0.25,
    maxStabilityDays: 90,
    initialDifficulty: 0.5,
    difficultyRate: 0.3,
  },
  priority: {
    weights: {
      reviewDue: 3,
      weakness: 2,
      prerequisiteNeed: 1.5,
      diversity: 1,
      transferNeed: 1.5,
      recentRepetition: 2.5,
    },
    recentWindow: 6,
    recentDecay: 0.5,
    repetitionHalfLifeHours: 12,
    blockedDependentsForFullNeed: 3,
  },
  session: {
    counts: { warmup: 2, reviews: 4, learn: 3, mixed: 4, challenge: 2 },
    warmupMinStage: "fluent",
    jitter: 0.05,
    maxSameSkillRun: 2,
    maxInSessionRepeats: 2,
  },
  profile: { maxHistory: 1000, maxSessionSummaries: 60 },
};
