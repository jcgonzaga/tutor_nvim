import {
  parseExercise,
  parseSkill,
  type Exercise,
  type ExerciseInput,
  type Skill,
} from "@tutor-nvim/exercise-schema";
import { DEFAULT_PEDAGOGY_CONFIG } from "./config";
import { DAY_MS } from "./math";
import { recordAttempt } from "./progress";
import type { AttemptOutcome, LearnerState } from "./types";
import { EMPTY_LEARNER } from "./types";

export const CONFIG = DEFAULT_PEDAGOGY_CONFIG;
export const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
export { DAY_MS };

/** A skill validated like real content. */
export function skillOf(slug: string, prerequisites: string[] = [], tier = 1): Skill {
  return parseSkill({
    schemaVersion: 1,
    id: slug.replaceAll(".", "-"),
    slug,
    title: slug,
    description: slug,
    domain: "vim",
    tier,
    prerequisites,
    difficulty: 1,
  });
}

/** An exercise validated like real content; only what pedagogy reads is configurable. */
export function exerciseFor(
  id: string,
  skillIds: string[],
  options: { language?: string; context?: string; difficulty?: number; transfer?: boolean } = {},
): Exercise {
  const { language, context, difficulty = 2, transfer = false } = options;
  const overrides: Partial<ExerciseInput> = {
    metadata: {
      ...(language === undefined ? {} : { language }),
      ...(context === undefined ? {} : { context }),
      transferTags: transfer ? ["context:other"] : [],
    },
  };
  return parseExercise({
    schemaVersion: 1,
    id,
    slug: id.replaceAll("-", "."),
    title: id,
    skillIds,
    mode: "recall",
    difficulty,
    initialState: { buffer: 'const mode = "development";\n', cursor: { line: 1, column: 18 } },
    objective: { type: "buffer_equals", target: 'const mode = "production";\n' },
    evaluation: { requireFinalNormalMode: true },
    solutions: [{ sequence: 'ci"production<Esc>', classification: "optimal" }],
    ...overrides,
  });
}

export const PERFECT: AttemptOutcome = {
  success: true,
  accuracyScore: 100,
  strategyScore: 100,
  fluencyScore: 100,
  performanceScore: 100,
  hintsUsed: 0,
};

export const SLOPPY: AttemptOutcome = {
  success: true,
  accuracyScore: 70,
  strategyScore: 45,
  fluencyScore: 40,
  performanceScore: 62,
  hintsUsed: 0,
};

export const FAILED: AttemptOutcome = {
  success: false,
  accuracyScore: 0,
  strategyScore: 0,
  fluencyScore: 0,
  performanceScore: 0,
  hintsUsed: 0,
};

/** Replays `attempts` ([exercise, outcome, time]) into a learner. */
export function replay(
  skills: readonly Skill[],
  attempts: ReadonlyArray<readonly [Exercise, AttemptOutcome, number]>,
  start: LearnerState = EMPTY_LEARNER,
): LearnerState {
  return attempts.reduce(
    (learner, [exercise, outcome, at]) =>
      recordAttempt(skills, learner, { exercise, outcome, at }, CONFIG).learner,
    start,
  );
}
