import type { Exercise, ExerciseHint } from "@tutor-nvim/exercise-schema";
import type { Attempt } from "./attempt";

/** A hint the learner asked for. */
export interface HintReveal {
  readonly level: number;
  readonly timestamp: number;
}

export interface HintStatus {
  /** Hints already shown, in level order. */
  readonly revealed: readonly ExerciseHint[];
  /** The next hint, or `null` when all were shown. */
  readonly next: { readonly hint: ExerciseHint; readonly availableAt: number } | null;
}

/**
 * Hints are progressive and timed: level N can be requested once its `afterMs`
 * has passed since the exercise was shown, and only after level N-1. Asking is
 * an explicit action, so every shown hint counts as used.
 */
export function hintStatus(exercise: Exercise, attempt: Attempt): HintStatus {
  const shown = attempt.hints.length;
  const nextHint = exercise.hints[shown];
  return {
    revealed: exercise.hints.slice(0, shown),
    next: nextHint ? { hint: nextHint, availableAt: attempt.startedAt + nextHint.afterMs } : null,
  };
}

export function canRevealHint(exercise: Exercise, attempt: Attempt, now: number): boolean {
  if (attempt.completedAt !== null) return false;
  const { next } = hintStatus(exercise, attempt);
  return next !== null && now >= next.availableAt;
}

/** Reveals the next hint if it is available at `now`; otherwise returns the attempt unchanged. */
export function revealHint(exercise: Exercise, attempt: Attempt, now: number): Attempt {
  const { next } = hintStatus(exercise, attempt);
  if (next === null || !canRevealHint(exercise, attempt, now)) return attempt;
  return { ...attempt, hints: [...attempt.hints, { level: next.hint.level, timestamp: now }] };
}
