import type { Skill } from "@tutor-nvim/exercise-schema";
import { DEFAULT_PEDAGOGY_CONFIG, type PedagogyConfig } from "./config";
import type { PersonalBestMetric } from "./personalBest";
import { recommendNext, type Recommendation } from "./recommend";
import { enqueueInSession, takeDueInSession, type InSessionEntry } from "./scheduler";
import { sessionItems, type DailySession, type SessionBlock, type SessionItem } from "./session";
import type { LearnerState } from "./types";

/** An item waiting to be played; `repeat` marks one brought back inside the session. */
export interface RunItem extends SessionItem {
  readonly repeat: boolean;
}

export interface CompletedItem {
  readonly exerciseId: string;
  readonly skillId: string;
  /** Every skill the exercise trains (what `recordAttempt` credited). */
  readonly skillIds: readonly string[];
  readonly block: SessionBlock;
  readonly repeat: boolean;
  readonly success: boolean;
  readonly performance: number;
  /** The attempt was the scheduled review of one of its skills. */
  readonly scheduledReview: boolean;
  readonly improved: readonly PersonalBestMetric[];
  readonly at: number;
}

/**
 * A daily session in progress (T-513). The plan is built once, so the day's list does not shift
 * under the learner as their state changes; the run only adds the exercises the scheduler asks to
 * see again inside the session (a lapse returns after 4, a shaky pass after 12).
 */
export interface SessionRun {
  readonly date: string;
  readonly plan: DailySession;
  readonly pending: readonly RunItem[];
  readonly completed: readonly CompletedItem[];
  /** Skills waiting to reappear, by number of exercises completed. */
  readonly inSession: readonly InSessionEntry[];
  /** How many times each skill was brought back, to cap a skill that keeps lapsing. */
  readonly repeats: Readonly<Record<string, number>>;
}

export function startSessionRun(plan: DailySession): SessionRun {
  return {
    date: plan.date,
    plan,
    pending: sessionItems(plan).map((item) => ({ ...item, repeat: false })),
    completed: [],
    inSession: [],
    repeats: {},
  };
}

export const currentItem = (run: SessionRun): RunItem | null => run.pending[0] ?? null;
export const isRunFinished = (run: SessionRun): boolean => run.pending.length === 0;

/** `done` out of `total`, where total grows when repeats are queued. */
export function runProgress(run: SessionRun): { readonly done: number; readonly total: number } {
  return { done: run.completed.length, total: run.completed.length + run.pending.length };
}

export interface ItemResult {
  readonly success: boolean;
  readonly performance: number;
  /** Epoch ms at which the attempt finished. */
  readonly at: number;
  readonly scheduledReview: boolean;
  readonly improved: readonly PersonalBestMetric[];
  /** Per skill, `SkillUpdate.inSessionAfter` from `recordAttempt`. */
  readonly skillUpdates: readonly {
    readonly skillId: string;
    readonly inSessionAfter: number | null;
  }[];
}

export interface CompleteOptions {
  /** Candidate exercise ids for a skill, best first; used to pick what comes back. */
  readonly exerciseIdsForSkill: (skillId: string) => readonly string[];
  readonly skillsOf: (exerciseId: string) => readonly string[];
}

/**
 * Records the result of the item in play, advances to the next one, and, when the scheduler had
 * asked for a skill to reappear and its turn has come, puts a repeat at the front of the queue.
 * A repeat prefers an exercise not yet played today, then at least a different one.
 */
export function completeItem(
  run: SessionRun,
  result: ItemResult,
  options: CompleteOptions,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): SessionRun {
  const item = run.pending[0];
  if (item === undefined) return run;

  const completed: CompletedItem[] = [
    ...run.completed,
    {
      exerciseId: item.exerciseId,
      skillId: item.skillId,
      skillIds: options.skillsOf(item.exerciseId),
      block: item.block,
      repeat: item.repeat,
      success: result.success,
      performance: result.performance,
      scheduledReview: result.scheduledReview,
      improved: result.improved,
      at: result.at,
    },
  ];

  let queue: readonly InSessionEntry[] = run.inSession;
  for (const update of result.skillUpdates) {
    if (update.inSessionAfter === null) continue;
    if ((run.repeats[update.skillId] ?? 0) >= config.session.maxInSessionRepeats) continue;
    queue = enqueueInSession(queue, update.skillId, update.inSessionAfter, completed.length);
  }

  const { due, rest } = takeDueInSession(queue, completed.length);
  const playedIds = new Set(completed.map((entry) => entry.exerciseId));
  const repeats = { ...run.repeats };
  const comeBack: RunItem[] = [];
  for (const entry of due) {
    if ((repeats[entry.skillId] ?? 0) >= config.session.maxInSessionRepeats) continue;
    const candidates = options.exerciseIdsForSkill(entry.skillId);
    const exerciseId =
      candidates.find((id) => !playedIds.has(id)) ??
      candidates.find((id) => id !== item.exerciseId) ??
      candidates[0];
    if (exerciseId === undefined) continue;
    repeats[entry.skillId] = (repeats[entry.skillId] ?? 0) + 1;
    comeBack.push({
      exerciseId,
      skillId: entry.skillId,
      block: "reviews",
      reason: "again: this skill needed another look",
      repeat: true,
    });
  }

  return {
    ...run,
    pending: [...comeBack, ...run.pending.slice(1)],
    completed,
    inSession: rest,
    repeats,
  };
}

export interface SessionSummary {
  readonly exercises: number;
  readonly successes: number;
  /** Distinct skills trained, in the order first practiced. */
  readonly skillsTrained: readonly string[];
  readonly reviewsCompleted: number;
  readonly personalBests: readonly {
    readonly exerciseId: string;
    readonly metrics: readonly PersonalBestMetric[];
  }[];
  readonly averagePerformance: number;
  readonly next: Recommendation;
}

/** End-of-session summary (T-515): what was trained, what was reviewed, records, and what is next. */
export function summarizeRun(
  run: SessionRun,
  skills: readonly Skill[],
  learner: LearnerState,
  now: number,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): SessionSummary {
  const { completed } = run;
  const trained: string[] = [];
  for (const entry of completed) {
    for (const skillId of entry.skillIds) if (!trained.includes(skillId)) trained.push(skillId);
  }
  const total = completed.reduce((sum, entry) => sum + entry.performance, 0);

  return {
    exercises: completed.length,
    successes: completed.filter((entry) => entry.success).length,
    skillsTrained: trained,
    reviewsCompleted: completed.filter((entry) => entry.scheduledReview).length,
    personalBests: completed
      .filter((entry) => entry.improved.length > 0)
      .map((entry) => ({ exerciseId: entry.exerciseId, metrics: entry.improved })),
    averagePerformance: completed.length === 0 ? 0 : total / completed.length,
    next: recommendNext(skills, learner, now, config),
  };
}
