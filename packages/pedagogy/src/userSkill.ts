import type { LearnerState, UserSkill } from "./types";

/** A skill the learner has never touched. Its stage is resolved against the skill graph. */
export function createUserSkill(skillId: string): UserSkill {
  return {
    skillId,
    stage: "locked",
    mastery: 0,
    accuracy: 0,
    strategy: 0,
    fluency: 0,
    retention: 0,
    transfer: 0,
    attemptCount: 0,
    lastAttemptAt: null,
    nextReviewAt: null,
    review: null,
    delayedRecallCount: 0,
    transferCount: 0,
    seenContexts: [],
  };
}

export function getUserSkill(learner: LearnerState, skillId: string): UserSkill {
  return learner.skills[skillId] ?? createUserSkill(skillId);
}
