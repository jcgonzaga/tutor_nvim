import type { Exercise, Skill } from "@tutor-nvim/exercise-schema";
import { placedSkills, type CalibrationResult, type ExperienceLevel } from "./calibration";
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
export const PROFILE_VERSION = 1;

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

export interface ActiveSession {
  readonly run: SessionRun;
  readonly startedAt: number;
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

export function startSession(profile: Profile, plan: DailySession, now: number): Profile {
  return { ...profile, activeSession: { run: startSessionRun(plan), startedAt: now } };
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
): Profile {
  const active = profile.activeSession;
  if (active === null) return profile;
  return {
    ...profile,
    activeSession: { ...active, run: completeItem(active.run, result, options, config) },
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
  };
  return {
    ...profile,
    activeSession: null,
    sessions: [...profile.sessions, entry].slice(-config.profile.maxSessionSummaries),
  };
}
