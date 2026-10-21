import { z } from "zod";
import {
  EXPERIENCE_LEVELS,
  KEYBOARD_LAYOUTS,
  MASTERY_STAGES,
  PERSONAL_BEST_METRICS,
  SESSION_BLOCKS,
  type AttemptRecord,
  type CalibrationResult,
  type ComboState,
  type GamificationState,
  type RecentBest,
  type RunRecord,
  type SessionRewards,
  type StreakState,
  type DailySession,
  type LearnerState,
  type PersonalBest,
  type SessionHistoryEntry,
  type SessionItem,
  type UserSkill,
} from "@tutor-nvim/pedagogy";

/**
 * Wire and storage shapes shared by the web app (localStorage, API client) and the API (request
 * validation, responses). External input is validated with these, never trusted as a domain type;
 * `satisfies z.ZodType<T>` keeps each schema in step with the pedagogy type it mirrors.
 */
export const count = z.number().int().nonnegative();
export const score = z.number().min(0).max(100);
export const epochMs = z.number().finite();
export const id = z.string().min(1).max(200);
export const uuid = z.uuid();
export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reviewStateSchema = z.object({
  stability: z.number().positive(),
  difficulty: z.number().min(0).max(1),
  dueAt: epochMs,
  lastPerformance: score,
  streak: count,
});

export const userSkillSchema = z.object({
  skillId: id,
  stage: z.enum(MASTERY_STAGES),
  mastery: score,
  accuracy: score,
  strategy: score,
  fluency: score,
  retention: score,
  transfer: score,
  attemptCount: count,
  lastAttemptAt: epochMs.nullable(),
  nextReviewAt: epochMs.nullable(),
  review: reviewStateSchema.nullable(),
  delayedRecallCount: count,
  transferCount: count,
  seenContexts: z.array(z.string()),
}) satisfies z.ZodType<UserSkill>;

export const learnerStateSchema = z.object({
  skills: z.record(z.string(), userSkillSchema),
  placed: z.array(id).optional(),
}) satisfies z.ZodType<LearnerState>;

export const personalBestMetricSchema = z.enum(PERSONAL_BEST_METRICS);

export const personalBestSchema = z.object({
  time: z.number().nullable(),
  efficiency: z.number().nullable(),
  performance: z.number().nullable(),
  reaction: z.number().nullable(),
}) satisfies z.ZodType<PersonalBest>;

export const attemptRecordSchema = z.object({
  exerciseId: id,
  skillIds: z.array(id),
  at: epochMs,
  success: z.boolean(),
  performance: z.number(),
}) satisfies z.ZodType<AttemptRecord>;

export const sessionHistoryEntrySchema = z.object({
  date: z.string(),
  startedAt: epochMs,
  finishedAt: epochMs,
  exercises: count,
  successes: count,
  reviewsCompleted: count,
  abandoned: z.boolean(),
  xp: count.optional(),
}) satisfies z.ZodType<SessionHistoryEntry>;

export const sessionItemSchema = z.object({
  exerciseId: id,
  skillId: id,
  block: z.enum(SESSION_BLOCKS),
  reason: z.string().max(500),
}) satisfies z.ZodType<SessionItem>;

export const dailySessionSchema = z.object({
  userId: id,
  date: isoDay,
  seed: z.string(),
  warmup: z.array(sessionItemSchema),
  reviews: z.array(sessionItemSchema),
  learn: z.array(sessionItemSchema),
  mixed: z.array(sessionItemSchema),
  challenge: z.array(sessionItemSchema),
}) satisfies z.ZodType<DailySession>;

export const calibrationResultSchema = z.object({
  experience: z.enum(EXPERIENCE_LEVELS),
  placedRung: z.number().int().min(-1),
  probes: count,
  rungs: z.array(
    z.object({
      topic: z.string(),
      skillId: id,
      outcome: z.enum(["passed", "failed", "assumed", "untested"]),
    }),
  ),
}) satisfies z.ZodType<CalibrationResult>;

export const keyboardLayoutSchema = z.enum(KEYBOARD_LAYOUTS);
export const experienceSchema = z.enum(EXPERIENCE_LEVELS);

export const comboStateSchema = z.object({
  current: count,
  best: count,
}) satisfies z.ZodType<ComboState>;

export const sessionRewardsSchema = z.object({
  dailyBonusXp: count,
  streak: count,
  longestStreak: count,
  firstOfDay: z.boolean(),
}) satisfies z.ZodType<SessionRewards>;

export const streakStateSchema = z.object({
  current: count,
  longest: count,
  lastDay: isoDay.nullable(),
}) satisfies z.ZodType<StreakState>;

export const runRecordSchema = z.object({
  keys: z.array(z.string().max(32)).max(2000),
  times: z.array(z.number().finite()).max(2000),
  durationMs: z.number().finite().nonnegative(),
  performance: z.number().min(0).max(100),
  at: epochMs,
}) satisfies z.ZodType<RunRecord>;

export const recentBestSchema = z.object({
  exerciseId: id,
  metrics: z.array(personalBestMetricSchema),
  at: epochMs,
}) satisfies z.ZodType<RecentBest>;

export const gamificationStateSchema = z.object({
  xp: count,
  xpByDay: z.record(isoDay, count),
  streak: streakStateSchema,
  bestCombo: count,
  recentBests: z.array(recentBestSchema),
  bestRuns: z.record(z.string(), runRecordSchema),
}) satisfies z.ZodType<GamificationState>;
