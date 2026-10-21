import type { Exercise, Skill } from "@tutor-nvim/exercise-schema";
import { placedSkills, type CalibrationResult, type ExperienceLevel } from "./calibration";
import {
  DEFAULT_GAMIFICATION_CONFIG,
  EMPTY_COMBO,
  EMPTY_GAMIFICATION,
  addXp,
  awardAttemptXp,
  recordCompletedDay,
  rememberBestRun,
  rememberRecentBest,
  updateCombo,
  xpOn,
  type ComboFacts,
  type ComboResult,
  type ComboState,
  type GamificationConfig,
  type GamificationState,
  type RunRecord,
  type XpAward,
} from "./gamification";
import { DEFAULT_PEDAGOGY_CONFIG, type PedagogyConfig } from "./config";
import {
  updatePersonalBest,
  type BestInput,
  type PersonalBest,
  type PersonalBestMetric,
} from "./personalBest";
import { recordAttempt, refreshStages, type SkillUpdate } from "./progress";
import type { DailySession } from "./session";
import {
  completeItem,
  isRunFinished,
  startSessionRun,
  type CompleteOptions,
  type ItemResult,
  type SessionRun,
} from "./sessionRun";
import { EMPTY_LEARNER, type AttemptOutcome, type AttemptRecord, type LearnerState } from "./types";

/**
 * Everything the product remembers about one learner on one device (T-511): plain JSON, with a
 * version so stored profiles can be migrated. Persistence itself is the app's job; this module
 * only defines the shape and the pure transitions, so the same profile can later sync to the cloud
 * (M6) and the transitions stay testable without a browser.
 */
export const PROFILE_VERSION = 2;

export const KEYBOARD_LAYOUTS = ["us-ansi", "es-iso"] as const;
export type KeyboardLayout = (typeof KEYBOARD_LAYOUTS)[number];

export interface ProfileSettings {
  readonly keyboardLayout: KeyboardLayout;
}

export interface OnboardingState {
  readonly completed: boolean;
  /** Only ever used to choose where calibration starts; never as evidence. */
  readonly experience: ExperienceLevel | null;
  readonly calibration: CalibrationResult | null;
  readonly completedAt: number | null;
}

/** What finishing the daily session paid (T-802, T-803). Set once, when the last exercise is done. */
export interface SessionRewards {
  /** XP for the first completed session of the day; 0 for a further one. */
  readonly dailyBonusXp: number;
  /** Streak after this session. */
  readonly streak: number;
  readonly longestStreak: number;
  /** The first completed session of its day (the one that counts for the streak). */
  readonly firstOfDay: boolean;
}

export interface ActiveSession {
  readonly run: SessionRun;
  readonly startedAt: number;
  /** Combo of this session. It starts at 0 each session and never leaves it. */
  readonly combo: ComboState;
  readonly rewards: SessionRewards | null;
}

/** What is kept about a finished (or abandoned) session. */
export interface SessionHistoryEntry {
  readonly date: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly exercises: number;
  readonly successes: number;
  readonly reviewsCompleted: number;
  readonly abandoned: boolean;
  /** XP of the whole session, daily bonus included. */
  readonly xp?: number;
}

export interface Profile {
  readonly version: typeof PROFILE_VERSION;
  readonly userId: string;
  readonly createdAt: number;
  readonly settings: ProfileSettings;
  readonly onboarding: OnboardingState;
  readonly learner: LearnerState;
  readonly history: readonly AttemptRecord[];
  readonly personalBests: Readonly<Record<string, PersonalBest>>;
  readonly activeSession: ActiveSession | null;
  readonly sessions: readonly SessionHistoryEntry[];
  /** The game layer: XP, streak, records, best runs. Never read by the pedagogy engine. */
  readonly gamification: GamificationState;
}

export function createProfile(userId: string, now: number): Profile {
  return {
    version: PROFILE_VERSION,
    userId,
    createdAt: now,
    settings: { keyboardLayout: "us-ansi" },
    onboarding: { completed: false, experience: null, calibration: null, completedAt: null },
    learner: EMPTY_LEARNER,
    history: [],
    personalBests: {},
    activeSession: null,
    sessions: [],
    gamification: EMPTY_GAMIFICATION,
  };
}

export function setKeyboardLayout(profile: Profile, keyboardLayout: KeyboardLayout): Profile {
  return { ...profile, settings: { ...profile.settings, keyboardLayout } };
}

export function setExperience(profile: Profile, experience: ExperienceLevel): Profile {
  return { ...profile, onboarding: { ...profile.onboarding, experience } };
}

/**
 * Finishes onboarding. The calibration outcome becomes the initial estimate: the skills the
 * learner was placed past unlock what builds on them (`LearnerState.placed`), with no evidence
 * and no mastery granted. The self-reported experience was only used to start calibration.
 */
export function completeOnboarding(
  profile: Profile,
  skills: readonly Skill[],
  calibration: CalibrationResult | null,
  now: number,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): Profile {
  const placed = new Set([
    ...(profile.learner.placed ?? []),
    ...(calibration ? placedSkills(skills, calibration) : []),
  ]);
  const learner =
    placed.size === 0
      ? profile.learner
      : refreshStages(skills, { ...profile.learner, placed: [...placed].sort() }, config);
  return {
    ...profile,
    learner,
    onboarding: { ...profile.onboarding, completed: true, calibration, completedAt: now },
  };
}

export interface FinishedAttempt {
  readonly exercise: Pick<Exercise, "id" | "skillIds" | "metadata">;
  /** `evaluateAttempt(...).metrics` satisfies this. */
  readonly metrics: AttemptOutcome & BestInput;
  /** Epoch ms at which the attempt finished. */
  readonly at: number;
}

export interface AppliedAttempt {
  readonly profile: Profile;
  readonly updates: readonly SkillUpdate[];
  readonly improved: readonly PersonalBestMetric[];
}

/**
 * Applies one finished attempt: skill evidence, mastery, review schedule and stages
 * (`recordAttempt`), the attempt history, and the exercise's personal bests.
 */
export function applyAttempt(
  profile: Profile,
  skills: readonly Skill[],
  attempt: FinishedAttempt,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): AppliedAttempt {
  const { exercise, metrics, at } = attempt;
  const recorded = recordAttempt(
    skills,
    profile.learner,
    { exercise, outcome: metrics, at },
    config,
  );
  const { best, improved } = updatePersonalBest(profile.personalBests[exercise.id], metrics);

  const record: AttemptRecord = {
    exerciseId: exercise.id,
    skillIds: exercise.skillIds,
    at,
    success: metrics.success,
    performance: metrics.performanceScore,
  };
  return {
    profile: {
      ...profile,
      learner: recorded.learner,
      history: [...profile.history, record].slice(-config.profile.maxHistory),
      personalBests: { ...profile.personalBests, [exercise.id]: best },
    },
    updates: recorded.updates,
    improved,
  };
}

/** What the game layer needs to know about a finished attempt, beyond what mastery reads. */
export interface RewardInput {
  readonly feedback: "perfect" | "completed" | "failed";
  readonly strategy: ComboFacts["strategy"];
  /** Highest hint level revealed; 0 when none. */
  readonly maxHintLevel: number;
  readonly antiPatterns: number;
  /** The run, to keep as the exercise's best and to replay. */
  readonly run: RunRecord;
  /** Local calendar day of the attempt, `YYYY-MM-DD`. */
  readonly day: string;
  /** Maps an epoch time to its local calendar day (injected: the domain has no time zone). */
  readonly dayOf: (at: number) => string;
  /** The attempt is part of the active daily session (combo applies only there). */
  readonly inSession: boolean;
}

export interface FinishedAttemptResult extends AppliedAttempt {
  readonly award: XpAward;
  readonly combo: ComboResult;
}

/** How many times `exerciseId` was already solved on `day`, before the attempt being recorded. */
export function completionsOn(
  history: readonly AttemptRecord[],
  exerciseId: string,
  day: string,
  dayOf: (at: number) => string,
): number {
  return history.filter(
    (record) => record.exerciseId === exerciseId && record.success && dayOf(record.at) === day,
  ).length;
}

/**
 * Records a finished attempt: the learning side first, then the game side (T-801, T-802).
 *
 * The two are strictly separate. `applyAttempt` updates mastery, review schedule and history
 * exactly as before and knows nothing about XP; the game layer then reads *facts* about the attempt
 * and writes only `gamification` and the session's combo. Nothing the game layer produces is an
 * input to the learner state, so XP cannot buy mastery (AGENTS 2.7).
 */
export function finishAttempt(
  profile: Profile,
  skills: readonly Skill[],
  attempt: FinishedAttempt,
  reward: RewardInput,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
  game: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): FinishedAttemptResult {
  const { metrics, exercise, at } = attempt;
  // Counted before the attempt joins the history, or it would count itself.
  const prior = completionsOn(profile.history, exercise.id, reward.day, reward.dayOf);

  const applied = applyAttempt(profile, skills, attempt, config);

  const active = reward.inSession ? profile.activeSession : null;
  const combo = updateCombo(
    active?.combo ?? EMPTY_COMBO,
    {
      success: metrics.success,
      strategy: reward.strategy,
      maxHintLevel: reward.maxHintLevel,
      antiPatterns: reward.antiPatterns,
    },
    game,
  );
  const award = awardAttemptXp(
    {
      success: metrics.success,
      feedback: reward.feedback,
      hintsUsed: metrics.hintsUsed,
      scheduledReview: applied.updates.some((update) => update.scheduledReview),
      transferEvidence: applied.updates.some((update) => update.transferEvidence),
      personalBests: applied.improved.length,
      priorCompletionsToday: prior,
      xpToday: xpOn(profile.gamification, reward.day),
      combo: Math.max(1, combo.state.current),
    },
    game,
  );

  let gamification = addXp(profile.gamification, reward.day, award.total, true, game);
  gamification = { ...gamification, bestCombo: Math.max(gamification.bestCombo, combo.state.best) };
  if (metrics.success) {
    gamification = rememberBestRun(gamification, exercise.id, reward.run);
    gamification = rememberRecentBest(
      gamification,
      { exerciseId: exercise.id, metrics: applied.improved, at },
      game,
    );
  }

  return {
    ...applied,
    profile: {
      ...applied.profile,
      gamification,
      activeSession: active ? { ...active, combo: combo.state } : applied.profile.activeSession,
    },
    award,
    combo,
  };
}

export function startSession(profile: Profile, plan: DailySession, now: number): Profile {
  return {
    ...profile,
    activeSession: {
      run: startSessionRun(plan),
      startedAt: now,
      combo: EMPTY_COMBO,
      rewards: null,
    },
  };
}

/** The session in progress for `date`, or `null` (a session from an earlier day is not resumed). */
export function activeSessionFor(profile: Profile, date: string): ActiveSession | null {
  return profile.activeSession?.run.date === date ? profile.activeSession : null;
}

export function completeSessionItem(
  profile: Profile,
  result: ItemResult,
  options: CompleteOptions,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
  game: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): Profile {
  const active = profile.activeSession;
  if (active === null) return profile;
  const run = completeItem(active.run, result, options, config);
  const updated: Profile = { ...profile, activeSession: { ...active, run } };
  // Finishing the last exercise is what completes the daily session: pay out once.
  return isRunFinished(run) && active.rewards === null
    ? rewardCompletedSession(updated, game)
    : updated;
}

/**
 * Pays the rewards of a finished daily session (T-803): the streak and, for the first session of
 * the day, the daily XP bonus. Idempotent through `ActiveSession.rewards`.
 */
function rewardCompletedSession(profile: Profile, game: GamificationConfig): Profile {
  const active = profile.activeSession;
  if (active === null || active.rewards !== null) return profile;
  const day = active.run.date;
  const firstOfDay = profile.gamification.streak.lastDay !== day;
  const streak = recordCompletedDay(profile.gamification.streak, day, game);
  const dailyBonusXp = firstOfDay ? game.xp.dailyCompletionBonus : 0;
  return {
    ...profile,
    gamification: addXp({ ...profile.gamification, streak }, day, dailyBonusXp, false, game),
    activeSession: {
      ...active,
      rewards: { dailyBonusXp, streak: streak.current, longestStreak: streak.longest, firstOfDay },
    },
  };
}

/**
 * Closes the active session into the history. `abandoned` marks one the learner never finished
 * (for example left over from an earlier day); an abandoned session with no attempts leaves no trace.
 */
export function endSession(
  profile: Profile,
  now: number,
  abandoned: boolean,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): Profile {
  const active = profile.activeSession;
  if (active === null) return profile;

  const { completed } = active.run;
  if (abandoned && completed.length === 0) return { ...profile, activeSession: null };

  const entry: SessionHistoryEntry = {
    date: active.run.date,
    startedAt: active.startedAt,
    finishedAt: now,
    exercises: completed.length,
    successes: completed.filter((item) => item.success).length,
    reviewsCompleted: completed.filter((item) => item.scheduledReview).length,
    abandoned,
    xp:
      completed.reduce((sum, item) => sum + (item.xp ?? 0), 0) +
      (active.rewards?.dailyBonusXp ?? 0),
  };
  return {
    ...profile,
    activeSession: null,
    sessions: [...profile.sessions, entry].slice(-config.profile.maxSessionSummaries),
  };
}
