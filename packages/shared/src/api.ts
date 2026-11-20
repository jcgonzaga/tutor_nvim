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
/** Largest workspace attempt the API accepts; a story is a handful of steps, typing included. */
export const MAX_ATTEMPT_STEPS = 2000;

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
 * One action of a workspace attempt, as it travels over the wire (T9).
 *
 * A story is spent in steps, and an action is one of the two kinds: the name a layer resolved plus
 * the one thing it acted on — the file it opens, the text it types, the query it searches for, the
 * command it runs, the tab it moves a window into — so the server can apply it through the engine.
 * The shape is declared here because this module is the wire format: every field is a bounded
 * string, and that is all it promises.
 *
 * It is deliberately not the last word: `apps/api` re-validates every action against
 * `workspaceActionRefSchema` from `@tutor-nvim/exercise-schema` before replaying it, so an action
 * whose fields do not belong to its verb is rejected there with the vocabulary's own message. The
 * transport must not depend on `@tutor-nvim/exercise-schema` for one field (it would put content
 * validation inside the wire format), and the API is the strict gate.
 */
export const attemptActionSchema = z.object({
  action: z.string().min(1).max(64),
  /** What an operator acts on (`iw`); only the editing verbs take one. */
  target: z.string().min(1).max(64).optional(),
  /** The file a `file.open`/`file.new`/`buffer.list` names. */
  path: z.string().min(1).max(1024).optional(),
  /** The text an `edit.insert` types. */
  text: z.string().min(1).max(8192).optional(),
  /** The query a project picker searches for. */
  query: z.string().min(1).max(512).optional(),
  /** The command a `shell.run` runs in the focused terminal. */
  command: z.string().min(1).max(512).optional(),
  /** The tab a `workspace.move` moves the focused window into. */
  tab: z.string().min(1).max(64).optional(),
});
export type AttemptAction = z.output<typeof attemptActionSchema>;

/**
 * One step of a workspace attempt, as it travels over the wire (T9): an action a layer resolved, or a
 * key the engine took (typing in a buffer, `:e src/util.ts`, a command at a terminal prompt).
 *
 * The two kinds share one ordered list because the order is the attempt: a story is "open the file,
 * type this, save", and replaying the actions apart from the keys would reach a state nobody saw.
 * The key shape is the existing event shape, because that is what the engine's dispatch takes.
 */
export const attemptStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("action"), action: attemptActionSchema }),
  z.object({
    kind: z.literal("key"),
    key: z.string().min(1).max(32),
    code: z.string().max(32).nullish(),
    ctrl: z.boolean().default(false),
    alt: z.boolean().default(false),
    shift: z.boolean().default(false),
    meta: z.boolean().default(false),
    timestamp: z.number().finite(),
  }),
]);
export type AttemptStep = z.output<typeof attemptStepSchema>;

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
  /**
   * The steps of a workspace attempt, in the order they were taken (T9): an action a layer
   * resolved, or a key the engine took. A key-based attempt leaves this empty and sends `events`; a
   * workspace story leaves `events` empty, because its keys are recorded here, in order with its
   * actions — an empty keypress stream would be the honest record of a story that was not one.
   */
  steps: z.array(attemptStepSchema).max(MAX_ATTEMPT_STEPS).default([]),
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
