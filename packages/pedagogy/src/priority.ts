import type { Exercise, Skill } from "@tutor-nvim/exercise-schema";
import type { PedagogyConfig } from "./config";
import { isTransferEvidence } from "./evidence";
import { clamp, DAY_MS, HOUR_MS } from "./math";
import { isDue, retrievability } from "./scheduler";
import { stageRank, type AttemptRecord, type LearnerState } from "./types";
import { isUnlocked, type StageMap } from "./unlock";
import { getUserSkill } from "./userSkill";

/** An exercise already chosen for the session being built or played, in order. */
export interface RecentPick {
  readonly exerciseId: string;
  readonly skillIds: readonly string[];
}

export interface PriorityContext {
  readonly now: number;
  readonly skills: readonly Skill[];
  readonly learner: LearnerState;
  readonly stages: StageMap;
  /** Exercises chosen earlier in this session, oldest first. */
  readonly recent: readonly RecentPick[];
  /** Attempts from earlier sessions; drives the cross-session repetition penalty. */
  readonly history: readonly AttemptRecord[];
}

/** Each component is 0-1 before weighting, so scores are explainable and testable. */
export interface PriorityScore {
  readonly exerciseId: string;
  /** The skill that earned the exercise its score. */
  readonly skillId: string;
  readonly reviewDue: number;
  readonly weakness: number;
  readonly prerequisiteNeed: number;
  readonly diversity: number;
  readonly transferNeed: number;
  readonly recentRepetition: number;
  readonly score: number;
}

/** Every skill the exercise trains must be available to the learner. */
export function isExerciseAvailable(
  exercise: Pick<Exercise, "skillIds">,
  stages: StageMap,
): boolean {
  return exercise.skillIds.every((skillId) => isUnlocked(stages, skillId));
}

/** Distance (1 = the latest pick) of the closest recent pick matching, or null. */
function distanceToRecent(
  recent: readonly RecentPick[],
  window: number,
  matches: (pick: RecentPick) => boolean,
): number | null {
  for (let distance = 1; distance <= Math.min(window, recent.length); distance += 1) {
    const pick = recent[recent.length - distance];
    if (pick !== undefined && matches(pick)) return distance;
  }
  return null;
}

function blockedDependents(skillId: string, context: PriorityContext): number {
  return context.skills.filter(
    (skill) =>
      skill.enabled &&
      skill.prerequisites.includes(skillId) &&
      !isUnlocked(context.stages, skill.slug),
  ).length;
}

function scoreForSkill(
  exercise: Exercise,
  skillId: string,
  context: PriorityContext,
  config: PedagogyConfig,
): PriorityScore {
  const rules = config.priority;
  const userSkill = getUserSkill(context.learner, skillId);

  let reviewDue = 0;
  if (
    isDue(userSkill, context.now) &&
    userSkill.review !== null &&
    userSkill.nextReviewAt !== null
  ) {
    const overdueDays = (context.now - userSkill.nextReviewAt) / DAY_MS;
    reviewDue = 0.5 + 0.5 * clamp(overdueDays / userSkill.review.stability, 0, 1);
  }

  const weakness =
    userSkill.attemptCount === 0
      ? 0.5
      : clamp(
          Math.max(1 - userSkill.mastery / 100, 1 - retrievability(userSkill, context.now)),
          0,
          1,
        );

  // Only a skill that still blocks something is needed as a prerequisite.
  const stillBlocking =
    stageRank(context.stages[skillId] ?? "locked") < stageRank(config.unlock.minPrerequisiteStage);
  const prerequisiteNeed = stillBlocking
    ? clamp(blockedDependents(skillId, context) / rules.blockedDependentsForFullNeed, 0, 1)
    : 0;

  const skillDistance = distanceToRecent(context.recent, rules.recentWindow, (pick) =>
    pick.skillIds.includes(skillId),
  );
  const diversity = skillDistance === null ? 1 : 1 - rules.recentDecay ** (skillDistance - 1);

  const practiced = stageRank(context.stages[skillId] ?? "locked") >= stageRank("practicing");
  const transferNeed =
    practiced && isTransferEvidence(exercise, userSkill.seenContexts)
      ? clamp(1 - userSkill.transfer / 100, 0, 1)
      : 0;

  const exerciseDistance = distanceToRecent(
    context.recent,
    rules.recentWindow,
    (pick) => pick.exerciseId === exercise.id,
  );
  const inSession = exerciseDistance === null ? 0 : rules.recentDecay ** (exerciseDistance - 1);
  const lastSeen = context.history
    .filter((record) => record.exerciseId === exercise.id)
    .reduce<number | null>(
      (latest, record) => (latest === null ? record.at : Math.max(latest, record.at)),
      null,
    );
  const earlier =
    lastSeen === null
      ? 0
      : 0.5 ** (Math.max(0, context.now - lastSeen) / HOUR_MS / rules.repetitionHalfLifeHours);
  const recentRepetition = Math.max(inSession, earlier);

  const weights = rules.weights;
  const score =
    weights.reviewDue * reviewDue +
    weights.weakness * weakness +
    weights.prerequisiteNeed * prerequisiteNeed +
    weights.diversity * diversity +
    weights.transferNeed * transferNeed -
    weights.recentRepetition * recentRepetition;

  return {
    exerciseId: exercise.id,
    skillId,
    reviewDue,
    weakness,
    prerequisiteNeed,
    diversity,
    transferNeed,
    recentRepetition,
    score,
  };
}

/**
 * Exercise priority (T-407, PRD 31):
 *
 *   reviewDue + weakness + prerequisiteNeed + diversity + transferNeed - recentRepetition
 *
 * each weighted from configuration. Deterministic: no randomness here; the session builder
 * adds its own seeded jitter. An exercise training several skills takes its best skill's score.
 */
export function scoreExercise(
  exercise: Exercise,
  context: PriorityContext,
  config: PedagogyConfig,
): PriorityScore {
  let best: PriorityScore | null = null;
  for (const skillId of exercise.skillIds) {
    const candidate = scoreForSkill(exercise, skillId, context, config);
    if (best === null || candidate.score > best.score) best = candidate;
  }
  if (best === null) throw new Error(`exercise ${exercise.id} trains no skills`);
  return best;
}
