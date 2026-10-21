import { z } from "zod";
import type {
  AttemptRecord,
  CalibrationResult,
  DailySession,
  ExperienceLevel,
  GamificationState,
  StreakState,
  KeyboardLayout,
  LearnerState,
  PersonalBest,
  SessionHistoryEntry,
} from "@tutor-nvim/pedagogy";
import {
  attemptRecordSchema,
  calibrationResultSchema,
  count,
  dailySessionSchema,
  epochMs,
  experienceSchema,
  gamificationStateSchema,
  id,
  isoDay,
  keyboardLayoutSchema,
  learnerStateSchema,
  personalBestMetricSchema,
  personalBestSchema,
  sessionHistoryEntrySchema,
  sessionItemSchema,
  streakStateSchema,
  uuid,
} from "./schemas";

/** Largest attempt the API accepts; an exercise is a few dozen keys, so this is generous. */
export const MAX_ATTEMPT_EVENTS = 2000;
export const MAX_ATTEMPTS_PER_BATCH = 100;

/**
 * One logical input of an attempt, enough to replay it (AGENTS 11). `timestamp` is the client's
 * `performance.now()` at the keypress; it is only used for latency metrics.
 */
export const attemptEventSchema = z.object({
  key: z.string().min(1).max(32),
  code: z.string().max(32).nullish(),
  ctrl: z.boolean().default(false),
  alt: z.boolean().default(false),
  shift: z.boolean().default(false),
  meta: z.boolean().default(false),
  timestamp: z.number().finite(),
});
export type AttemptEventInput = z.output<typeof attemptEventSchema>;

/**
 * A finished attempt as the client reports it. The client sends what the learner *did*, never what
 * it scored: the server replays `events` through the same Vim engine and evaluation as the client
 * and computes success, strategy and metrics itself (AGENTS 26: client scores are untrusted).
 * The id is client-generated so a retry after a lost response cannot count the attempt twice.
 */
export const attemptSubmissionSchema = z.object({
  id: uuid,
  exerciseId: id,
  /** `performance.now()` when the attempt started. */
  startedAt: z.number().finite(),
  /** `performance.now()` when it ended (solved or given up). */
  completedAt: z.number().finite().nullable(),
  gaveUp: z.boolean().default(false),
  /** Wall-clock time (epoch ms) at which the attempt finished; drives review scheduling. */
  finishedAt: epochMs,
  /**
   * The learner's local calendar day, `YYYY-MM-DD`. XP decay, the daily XP cap and the streak
   * are per local day, which the server cannot know; without it the UTC day is used.
   */
  localDay: isoDay.nullish(),
  sessionId: uuid.nullish(),
  events: z.array(attemptEventSchema).max(MAX_ATTEMPT_EVENTS),
  hints: z
    .array(z.object({ level: z.number().int().min(1).max(10), timestamp: z.number().finite() }))
    .max(20)
    .default([]),
});
export type AttemptSubmission = z.output<typeof attemptSubmissionSchema>;
export type AttemptSubmissionInput = z.input<typeof attemptSubmissionSchema>;

export const attemptBatchSchema = z.object({
  attempts: z.array(attemptSubmissionSchema).min(1).max(MAX_ATTEMPTS_PER_BATCH),
});

export const attemptResultSchema = z.object({
  id: uuid,
  exerciseId: id,
  success: z.boolean(),
  strategy: z.string(),
  performanceScore: z.number(),
  improved: z.array(personalBestMetricSchema),
  /** XP the server awarded (it recomputes it; the client's own figure is never read). */
  xp: z.number().int().nonnegative().default(0),
  /** True when this id had already been recorded; nothing was applied a second time. */
  duplicate: z.boolean(),
});
export type AttemptResult = z.output<typeof attemptResultSchema>;

export const attemptBatchResultSchema = z.object({ results: z.array(attemptResultSchema) });

/** Declared by hand (readonly, like the domain types it carries); the schema must satisfy it. */
export interface Settings {
  readonly keyboardLayout: KeyboardLayout;
  readonly experience: ExperienceLevel | null;
  /** The calibration outcome; the server derives the placement from it, it does not trust a list. */
  readonly calibration: CalibrationResult | null;
  readonly onboardingCompletedAt: number | null;
}
export const settingsSchema: z.ZodType<Settings> = z.object({
  keyboardLayout: keyboardLayoutSchema,
  experience: experienceSchema.nullable(),
  calibration: calibrationResultSchema.nullable(),
  onboardingCompletedAt: epochMs.nullable(),
});

export const meSchema: z.ZodType<Me> = z.object({
  id: uuid,
  authUserId: id,
  email: z.string().nullable(),
  settings: settingsSchema,
  hasProgress: z.boolean(),
});
export interface Me {
  readonly id: string;
  readonly authUserId: string;
  readonly email: string | null;
  readonly settings: Settings;
  /** The account already has recorded evidence (an attempt, or a skill that was practiced). */
  readonly hasProgress: boolean;
}

export const skillDtoSchema = z.object({
  id,
  slug: id,
  title: z.string(),
  description: z.string(),
  domain: z.string(),
  tier: count,
  difficulty: count,
  prerequisites: z.array(id),
  enabled: z.boolean(),
});
export type SkillDto = z.output<typeof skillDtoSchema>;

/**
 * Everything the client needs to replace its local progress: the server-authoritative learner
 * state plus the history the session builder and the screens read.
 */
export const progressSnapshotSchema: z.ZodType<ProgressSnapshot> = z.object({
  userId: uuid,
  settings: settingsSchema,
  learner: learnerStateSchema,
  history: z.array(attemptRecordSchema),
  personalBests: z.record(z.string(), personalBestSchema),
  sessions: z.array(sessionHistoryEntrySchema),
  gamification: gamificationStateSchema,
  generatedAt: epochMs,
});
/** Declared by hand (readonly, like the domain types it carries); the schema must satisfy it. */
export interface ProgressSnapshot {
  readonly userId: string;
  readonly settings: Settings;
  readonly learner: LearnerState;
  readonly history: readonly AttemptRecord[];
  readonly personalBests: Readonly<Record<string, PersonalBest>>;
  readonly sessions: readonly SessionHistoryEntry[];
  /** XP, combo, streak and records, recomputed by the server from the uploaded attempts. */
  readonly gamification: GamificationState;
  readonly generatedAt: number;
}

export const sessionSubmissionSchema = z.object({
  id: uuid,
  date: isoDay,
  seed: z.string().max(100).default(""),
  startedAt: epochMs,
  finishedAt: epochMs.nullable(),
  abandoned: z.boolean().default(false),
  items: z
    .array(
      sessionItemSchema.extend({
        position: count,
        repeat: z.boolean().default(false),
        attemptId: uuid.nullish(),
      }),
    )
    .max(200),
});
export type SessionSubmission = z.output<typeof sessionSubmissionSchema>;

export const sessionRecordSchema = z.object({
  id: uuid,
  date: isoDay,
  startedAt: epochMs,
  finishedAt: epochMs.nullable(),
  abandoned: z.boolean(),
  items: z.number().int(),
});
export type SessionRecord = z.output<typeof sessionRecordSchema>;

export interface DailySessionResponse {
  readonly sessionId: string;
  readonly plan: DailySession;
}
export const dailySessionResponseSchema: z.ZodType<DailySessionResponse> = z.object({
  sessionId: uuid,
  plan: dailySessionSchema,
});

/**
 * Progress a device earned before it could upload attempts (the local-only product of M5). It has
 * no attempts to replay, so it is accepted once, into an account with no progress, and never again.
 */
export interface LegacyImport {
  readonly learner: LearnerState;
  readonly personalBests: Readonly<Record<string, PersonalBest>>;
  /** The game layer earned before sync: a baseline the server adds its own to. */
  readonly gamification?: {
    readonly xp: number;
    readonly bestCombo: number;
    readonly streak: StreakState;
  };
}
export const legacyImportSchema: z.ZodType<LegacyImport> = z.object({
  learner: learnerStateSchema,
  personalBests: z.record(z.string(), personalBestSchema),
  gamification: z
    .object({
      xp: count.max(10_000_000),
      bestCombo: count.max(100_000),
      streak: streakStateSchema,
    })
    .optional(),
});
