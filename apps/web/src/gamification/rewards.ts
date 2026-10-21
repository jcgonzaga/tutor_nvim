import { runOf } from "@tutor-nvim/evaluation";
import type { RewardInput } from "@tutor-nvim/pedagogy";
import { localDateKey } from "../clock";
import type { FinishedPractice } from "../practice/PracticeScreen";

/**
 * What the game layer needs from a finished attempt: facts, never a mastery value. The run is kept
 * so it can become the exercise's best and be replayed later.
 */
export function rewardInputFor(
  finished: FinishedPractice,
  at: number,
  inSession: boolean,
): RewardInput {
  const { attempt, evaluation, feedback } = finished;
  const run = runOf(attempt);
  return {
    feedback: feedback.kind,
    strategy: evaluation.strategy,
    maxHintLevel: attempt.hints.reduce((highest, hint) => Math.max(highest, hint.level), 0),
    antiPatterns: evaluation.antiPatterns.length,
    run: { ...run, performance: evaluation.metrics.performanceScore, at },
    day: localDateKey(at),
    dayOf: localDateKey,
    inSession,
  };
}
