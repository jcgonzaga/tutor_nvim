import type { Exercise, Skill } from "@tutor-nvim/exercise-schema";
import { DEFAULT_PEDAGOGY_CONFIG, type PedagogyConfig } from "./config";
import { isTransferEvidence } from "./evidence";
import { createRng, hashString } from "./random";
import {
  isExerciseAvailable,
  scoreExercise,
  type PriorityContext,
  type PriorityScore,
  type RecentPick,
} from "./priority";
import { isDue } from "./scheduler";
import { stageRank, type AttemptRecord, type LearnerState } from "./types";
import { resolveStages } from "./unlock";
import { getUserSkill } from "./userSkill";

export const SESSION_BLOCKS = ["warmup", "reviews", "learn", "mixed", "challenge"] as const;
export type SessionBlock = (typeof SESSION_BLOCKS)[number];

export interface SessionItem {
  readonly exerciseId: string;
  /** The skill this item is meant to exercise. */
  readonly skillId: string;
  readonly block: SessionBlock;
  /** Why the builder chose it; shown to the learner and handy when debugging. */
  readonly reason: string;
}

/** PRD 32. Blocks reference exercises by id so a session can be stored and replayed. */
export type DailySession = { readonly [block in SessionBlock]: readonly SessionItem[] } & {
  readonly userId: string;
  readonly date: string;
  readonly seed: string;
};

export interface SessionRequest {
  readonly userId: string;
  /** Calendar day the session is for, e.g. `2026-10-21`. Part of the seed. */
  readonly date: string;
  /** Extra seed, to ask for a different but still reproducible session. */
  readonly seed?: string;
  /** Epoch ms of "now" (the injected clock). */
  readonly now: number;
  readonly skills: readonly Skill[];
  readonly exercises: readonly Exercise[];
  readonly learner: LearnerState;
  readonly history: readonly AttemptRecord[];
}

interface Candidate {
  readonly exercise: Exercise;
  readonly breakdown: PriorityScore;
  /** Higher is picked first. */
  readonly rank: number;
}

/**
 * Daily session builder (T-408). Deterministic given `userId`, `date`, `seed` and the inputs:
 * the only randomness is a seeded jitter that breaks near-ties.
 *
 * Blocks (PRD 10): `warmup` (fluent skills, easy), `reviews` (skills whose review is due),
 * `learn` (one new skill, easiest first), `mixed` (interleaved practice across skills) and
 * `challenge` (transfer to a context the learner has not solved the skill in). Quotas a block
 * cannot fill (no reviews due yet, nothing fluent yet) go to `mixed` rather than being invented.
 * The same skill never runs more than `maxSameSkillRun` times in a row while an alternative exists.
 */
export function buildDailySession(
  request: SessionRequest,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): DailySession {
  const { now, learner, history, skills } = request;
  const seed = request.seed ?? "";
  const rng = createRng(hashString(`${request.userId}|${request.date}|${seed}`));
  const stages = resolveStages(skills, learner, config);
  const available = [...request.exercises]
    .filter((exercise) => isExerciseAvailable(exercise, stages))
    .sort((a, b) => a.id.localeCompare(b.id));

  const picked: SessionItem[] = [];
  const used = new Set<string>();
  const recent = (): RecentPick[] =>
    picked.map((item) => ({
      exerciseId: item.exerciseId,
      skillIds: [item.skillId],
    }));

  const context = (): PriorityContext => ({
    now,
    skills,
    learner,
    stages,
    recent: recent(),
    history,
  });

  const skillStageRank = (skillId: string): number => stageRank(stages[skillId] ?? "locked");

  /**
   * Fills `quota` slots of a block from `pool`. Highest `rank` first; a first pass keeps one
   * exercise per skill, a second pass allows repeats. Jitter is drawn in a fixed order.
   */
  const fill = (
    block: SessionBlock,
    quota: number,
    pool: readonly Exercise[],
    rankOf: (exercise: Exercise, breakdown: PriorityScore) => number,
    reasonOf: (exercise: Exercise, breakdown: PriorityScore) => string,
  ): SessionItem[] => {
    const items: SessionItem[] = [];
    const inBlock = new Set<string>();
    for (const distinctSkills of [true, false]) {
      while (items.length < quota) {
        const ctx = context();
        const candidates: Candidate[] = pool
          .filter((exercise) => !used.has(exercise.id))
          .map((exercise) => {
            const breakdown = scoreExercise(exercise, ctx, config);
            return {
              exercise,
              breakdown,
              rank: rankOf(exercise, breakdown) + config.session.jitter * rng(),
            };
          })
          .filter((candidate) => !distinctSkills || !inBlock.has(candidate.breakdown.skillId))
          .sort((a, b) => b.rank - a.rank || a.exercise.id.localeCompare(b.exercise.id));

        const last = picked.slice(-config.session.maxSameSkillRun);
        const runs =
          last.length === config.session.maxSameSkillRun &&
          last.every((item) => item.skillId === last[0]?.skillId);
        const choice =
          (runs ? candidates.find((c) => c.breakdown.skillId !== last[0]?.skillId) : undefined) ??
          candidates[0];
        if (choice === undefined) break;

        const item: SessionItem = {
          exerciseId: choice.exercise.id,
          skillId: choice.breakdown.skillId,
          block,
          reason: reasonOf(choice.exercise, choice.breakdown),
        };
        items.push(item);
        picked.push(item);
        used.add(choice.exercise.id);
        inBlock.add(item.skillId);
      }
    }
    return items;
  };

  const counts = config.session.counts;
  const warmupStage = stageRank(config.session.warmupMinStage);
  const dueSkills = new Set(
    Object.keys(learner.skills).filter((skillId) => isDue(getUserSkill(learner, skillId), now)),
  );
  const anyDue = (exercise: Exercise): boolean => exercise.skillIds.some((id) => dueSkills.has(id));
  const attempted = (exercise: Exercise): boolean =>
    exercise.skillIds.every((id) => getUserSkill(learner, id).attemptCount > 0);

  // Exercises that would be transfer evidence are kept for the challenge block, so reviews and
  // interleaved practice do not use them up.
  const transferPool = available.filter((exercise) =>
    exercise.skillIds.some(
      (id) =>
        skillStageRank(id) >= stageRank("practicing") &&
        isTransferEvidence(exercise, getUserSkill(learner, id).seenContexts),
    ),
  );
  const reserved = new Set(transferPool.map((exercise) => exercise.id));
  const regular = available.filter((exercise) => !reserved.has(exercise.id));

  // Warm-up: skills already fluent, easy ones first, nothing that is due (that is a review).
  const warmup = fill(
    "warmup",
    counts.warmup,
    regular.filter(
      (exercise) =>
        !anyDue(exercise) && exercise.skillIds.every((id) => skillStageRank(id) >= warmupStage),
    ),
    (exercise, b) => b.diversity - b.recentRepetition - exercise.difficulty / 10,
    () => "warm-up: a skill you already own",
  );

  const reviews = fill(
    "reviews",
    counts.reviews,
    regular.filter(anyDue),
    (_, b) => b.score,
    (_, b) => `review: due, ${Math.round(b.weakness * 100)}% weak`,
  );

  // Learn: skills still in `learning`, earliest tier first; easiest exercise first.
  const learnSkills = skills
    .filter((skill) => stages[skill.slug] === "learning" && !dueSkills.has(skill.slug))
    .sort((a, b) => a.tier - b.tier || a.slug.localeCompare(b.slug))
    .map((skill) => skill.slug);
  const learn: SessionItem[] = [];
  for (const slug of learnSkills) {
    if (learn.length >= counts.learn) break;
    const ctx = context();
    // Easiest first; whatever the learner saw very recently goes last.
    const seenRecently = (exercise: Exercise): number =>
      scoreExercise(exercise, ctx, config).recentRepetition > 0.5 ? 1 : 0;
    const pool = available
      .filter((exercise) => exercise.skillIds.includes(slug) && !used.has(exercise.id))
      .sort(
        (a, b) =>
          seenRecently(a) - seenRecently(b) ||
          a.difficulty - b.difficulty ||
          a.id.localeCompare(b.id),
      );
    for (const exercise of pool) {
      if (learn.length >= counts.learn) break;
      const item: SessionItem = {
        exerciseId: exercise.id,
        skillId: slug,
        block: "learn",
        reason: "learn: next skill on your map",
      };
      learn.push(item);
      picked.push(item);
      used.add(exercise.id);
    }
  }

  // Quotas warm-up and reviews could not fill flow into the interleaved block.
  const spare = counts.warmup - warmup.length + (counts.reviews - reviews.length);
  const mixed = fill(
    "mixed",
    counts.mixed + spare,
    regular.filter((exercise) => attempted(exercise)),
    (_, b) => b.score,
    () => "mixed: interleaved practice",
  );

  const challengePool =
    transferPool.length > 0
      ? transferPool
      : available.filter((exercise) =>
          exercise.skillIds.every((id) => skillStageRank(id) >= stageRank("practicing")),
        );
  const challenge = fill(
    "challenge",
    counts.challenge,
    challengePool,
    (exercise, b) =>
      transferPool.length > 0 ? b.transferNeed + b.score / 10 : exercise.difficulty + b.score / 10,
    () => (transferPool.length > 0 ? "challenge: same skill, new context" : "challenge: harder"),
  );

  return {
    userId: request.userId,
    date: request.date,
    seed,
    warmup,
    reviews,
    learn,
    mixed,
    challenge,
  };
}

/** The session in play order. */
export function sessionItems(session: DailySession): SessionItem[] {
  return SESSION_BLOCKS.flatMap((block) => session[block]);
}
