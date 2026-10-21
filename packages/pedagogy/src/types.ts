/** Lifecycle of a skill (PRD 27). Order matters: later stages are further along. */
export const MASTERY_STAGES = ["locked", "learning", "practicing", "fluent", "mastered"] as const;
export type MasteryStage = (typeof MASTERY_STAGES)[number];

export const stageRank = (stage: MasteryStage): number => MASTERY_STAGES.indexOf(stage);

/**
 * Spaced-repetition state of one skill (PRD 30). Times are epoch milliseconds so
 * state is plain JSON and every function stays pure: "now" is always an argument.
 */
export interface ReviewState {
  /** Days a memory is expected to last; the time scale of forgetting. */
  readonly stability: number;
  /** 0 (easy for this learner) to 1 (hard). */
  readonly difficulty: number;
  readonly dueAt: number;
  /** Performance score (0-100) of the latest attempt. */
  readonly lastPerformance: number;
  /** Consecutive successful delayed reviews; indexes the interval ladder. */
  readonly streak: number;
}

/**
 * What the learner has shown for one skill (PRD 27, 54). Every dimension is 0-100.
 * Skills are keyed by slug, like `Exercise.skillIds`.
 */
export interface UserSkill {
  readonly skillId: string;
  readonly stage: MasteryStage;
  readonly mastery: number;
  readonly accuracy: number;
  readonly strategy: number;
  readonly fluency: number;
  /** Only moves with delayed recall, never with same-session repetition. */
  readonly retention: number;
  /** Only moves with transfer evidence (a different context or an explicit transfer exercise). */
  readonly transfer: number;
  readonly attemptCount: number;
  readonly lastAttemptAt: number | null;
  readonly nextReviewAt: number | null;
  readonly review: ReviewState | null;
  /** Successful attempts that counted as delayed recall (T-410). */
  readonly delayedRecallCount: number;
  /** Successful attempts that counted as transfer evidence (T-409). */
  readonly transferCount: number;
  /** Context keys already practiced, used to recognize context variation. */
  readonly seenContexts: readonly string[];
}

/** Everything the pedagogy engine knows about one learner. Keyed by skill slug. */
export interface LearnerState {
  readonly skills: Readonly<Record<string, UserSkill>>;
}

export const EMPTY_LEARNER: LearnerState = { skills: {} };

/**
 * The slice of an attempt evaluation the pedagogy engine reads. `AttemptEvaluation["metrics"]`
 * from `@tutor-nvim/evaluation` satisfies it structurally, so this package does not depend on
 * evaluation.
 */
export interface AttemptOutcome {
  readonly success: boolean;
  readonly accuracyScore: number;
  readonly strategyScore: number;
  readonly fluencyScore: number;
  readonly performanceScore: number;
  readonly hintsUsed: number;
}

/** One finished attempt, as stored in the session history. */
export interface AttemptRecord {
  readonly exerciseId: string;
  readonly skillIds: readonly string[];
  /** Epoch ms at which the attempt finished. */
  readonly at: number;
  readonly success: boolean;
  readonly performance: number;
}
