import type { Exercise } from "@tutor-nvim/exercise-schema";
import type { PedagogyConfig } from "./config";

/** Where an exercise happens: its language and situation. Transfer is variation in this key. */
export function contextKey(exercise: Pick<Exercise, "metadata">): string {
  const { language, context } = exercise.metadata;
  return `${language ?? "any"}/${context ?? "any"}`;
}

/**
 * Transfer evidence (T-409): the learner already practiced the skill somewhere and this
 * exercise puts it in a context they have not succeeded in yet. The first context is the
 * skill's "home"; it can never be transfer, and repeating a context never counts twice.
 * `seenContexts` only holds contexts the learner solved. The same test tells the session
 * builder which exercises can still produce transfer evidence.
 */
export function isTransferEvidence(
  exercise: Pick<Exercise, "metadata">,
  seenContexts: readonly string[],
): boolean {
  return seenContexts.length > 0 && !seenContexts.includes(contextKey(exercise));
}

/**
 * Delayed recall (T-410): enough time passed since the previous attempt at this skill for the
 * learner to have forgotten something. Immediate repetition is practice, not retention evidence.
 */
export function isDelayedRecall(
  lastAttemptAt: number | null,
  at: number,
  config: PedagogyConfig,
): boolean {
  return lastAttemptAt !== null && at - lastAttemptAt >= config.mastery.delayedRecallMinMs;
}
