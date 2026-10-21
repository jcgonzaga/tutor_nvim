import type { Exercise, Skill } from "@tutor-nvim/exercise-schema";
import { DEFAULT_PEDAGOGY_CONFIG, type PedagogyConfig } from "./config";
import { contextKey, isDelayedRecall, isTransferEvidence } from "./evidence";
import { computeMastery } from "./mastery";
import { clamp, ema } from "./math";
import { scheduleReview } from "./scheduler";
import { resolveStages } from "./unlock";
import { createUserSkill, getUserSkill } from "./userSkill";
import type { AttemptOutcome, LearnerState, UserSkill } from "./types";

export interface AttemptInput {
  readonly exercise: Pick<Exercise, "id" | "skillIds" | "metadata">;
  /** `evaluateAttempt(...).metrics` satisfies this. */
  readonly outcome: AttemptOutcome;
  /** Epoch ms at which the attempt finished. */
  readonly at: number;
}

/** What one attempt did to one skill; the UI and tests can explain a change from it. */
export interface SkillUpdate {
  readonly skillId: string;
  readonly delayedRecall: boolean;
  readonly transferEvidence: boolean;
  readonly scheduledReview: boolean;
  readonly lapse: boolean;
  readonly inSessionAfter: number | null;
}

export interface RecordResult {
  readonly learner: LearnerState;
  readonly updates: readonly SkillUpdate[];
}

/** Hints are a form of help: the evidence an attempt gives shrinks with each one used. */
function accuracyEvidence(outcome: AttemptOutcome, config: PedagogyConfig): number {
  if (!outcome.success) return 0;
  const kept = Math.max(0, 1 - config.mastery.hintEvidencePenalty * outcome.hintsUsed);
  return clamp(outcome.accuracyScore * kept);
}

function applyToSkill(
  previous: UserSkill,
  input: AttemptInput,
  config: PedagogyConfig,
): { skill: UserSkill; update: SkillUpdate } {
  const { outcome, at, exercise } = input;
  const rate = config.mastery.learningRate;
  const delayedRecall = isDelayedRecall(previous.lastAttemptAt, at, config);
  const transferEvidence = isTransferEvidence(exercise, previous.seenContexts);
  const performance = outcome.success ? clamp(outcome.performanceScore) : 0;

  const schedule = scheduleReview(
    previous.review,
    {
      at,
      success: outcome.success,
      performance,
      hintsUsed: outcome.hintsUsed,
      delayed: delayedRecall,
    },
    config,
  );

  const dimensions = {
    accuracy: ema(previous.accuracy, accuracyEvidence(outcome, config), rate.accuracy),
    strategy: ema(previous.strategy, outcome.success ? outcome.strategyScore : 0, rate.strategy),
    fluency: ema(previous.fluency, outcome.success ? outcome.fluencyScore : 0, rate.fluency),
    // Retention and transfer move only with their own kind of evidence.
    retention: delayedRecall
      ? ema(previous.retention, performance, rate.retention)
      : previous.retention,
    transfer: transferEvidence
      ? ema(previous.transfer, performance, rate.transfer)
      : previous.transfer,
  };
  const key = contextKey(exercise);
  const next: UserSkill = {
    ...previous,
    ...dimensions,
    attemptCount: previous.attemptCount + 1,
    lastAttemptAt: at,
    nextReviewAt: schedule.review.dueAt,
    review: schedule.review,
    delayedRecallCount: previous.delayedRecallCount + (delayedRecall && outcome.success ? 1 : 0),
    transferCount: previous.transferCount + (transferEvidence && outcome.success ? 1 : 0),
    seenContexts:
      outcome.success && !previous.seenContexts.includes(key)
        ? [...previous.seenContexts, key]
        : previous.seenContexts,
    mastery: 0,
  };
  return {
    skill: { ...next, mastery: computeMastery(next, config) },
    update: {
      skillId: previous.skillId,
      delayedRecall,
      transferEvidence,
      scheduledReview: schedule.scheduledReview,
      lapse: schedule.lapse,
      inSessionAfter: schedule.inSessionAfter,
    },
  };
}

/**
 * Recomputes every stage against the skill graph. Finishing a prerequisite can unlock
 * dependents without their having a single attempt, so this runs after any change; newly
 * available skills get an entry in `learning`.
 */
export function refreshStages(
  skills: readonly Skill[],
  learner: LearnerState,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): LearnerState {
  const stages = resolveStages(skills, learner, config);
  const next: Record<string, UserSkill> = {};
  for (const [slug, userSkill] of Object.entries(learner.skills)) {
    next[slug] = { ...userSkill, stage: stages[slug] ?? "locked" };
  }
  for (const skill of skills) {
    const stage = stages[skill.slug];
    if (stage !== undefined && stage !== "locked" && next[skill.slug] === undefined) {
      next[skill.slug] = { ...createUserSkill(skill.slug), stage };
    }
  }
  return { ...learner, skills: next };
}

/**
 * Applies a finished attempt to every skill its exercise trains: evidence, mastery, the review
 * schedule, and then the stages of the whole graph. Pure: returns a new `LearnerState`.
 */
export function recordAttempt(
  skills: readonly Skill[],
  learner: LearnerState,
  input: AttemptInput,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): RecordResult {
  const updated: Record<string, UserSkill> = { ...learner.skills };
  const updates: SkillUpdate[] = [];
  for (const skillId of input.exercise.skillIds) {
    const { skill, update } = applyToSkill(getUserSkill(learner, skillId), input, config);
    updated[skillId] = skill;
    updates.push(update);
  }
  return { learner: refreshStages(skills, { ...learner, skills: updated }, config), updates };
}
