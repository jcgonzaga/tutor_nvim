import { stageRank, type LearnerState } from "./types";

export interface LessonQuery {
  /** Skills the exercise about to start trains, in order. */
  readonly skillIds: readonly string[];
  /** Which of them have theory to show. */
  readonly hasLesson: (skillId: string) => boolean;
  /** Skills whose theory was already shown. */
  readonly seen: readonly string[];
  readonly learner: LearnerState;
}

/**
 * Theory is taught once, before the first exercise of a skill the learner is still learning
 * (ADR-0005, PRD §8 Discover). A skill they already practice or master (placed by calibration, or
 * synced from another device) is not taught again: that theory stays one tap away in the skill's page.
 * Reading theory never changes mastery.
 */
export function lessonsToShow(query: LessonQuery): readonly string[] {
  const seen = new Set(query.seen);
  return query.skillIds.filter((skillId) => {
    if (seen.has(skillId) || !query.hasLesson(skillId)) return false;
    const stage = query.learner.skills[skillId]?.stage ?? "locked";
    return stageRank(stage) <= stageRank("learning");
  });
}
