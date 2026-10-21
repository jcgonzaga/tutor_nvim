import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

/**
 * Database schema (T-601). The database stores state; learning behaviour is calculated by the
 * domain packages (AGENTS 24), never by triggers or SQL.
 *
 * Skills and exercises mirror the validated YAML content so attempts and progress have real
 * foreign keys. The YAML stays the source of truth: the API upserts these rows from it at start-up.
 * Skills are referenced by `slug` because that is how the pedagogy engine keys them.
 *
 * Times that drive scheduling are epoch milliseconds (`bigint`, read as number), because the domain
 * works in epoch ms and a JSON profile round-trips them unchanged.
 */
const epoch = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** `sub` claim of the auth provider's token (Neon Auth / Better Auth user id). */
  authUserId: text("auth_user_id").notNull().unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  keyboardLayout: text("keyboard_layout").notNull().default("us-ansi"),
  experience: text("experience"),
  calibration: jsonb("calibration"),
  /** Skills calibration placed the learner past (derived server-side from `calibration`). */
  placed: jsonb("placed")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  onboardingCompletedAt: epoch("onboarding_completed_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skills = pgTable("skills", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  domain: text("domain").notNull(),
  tier: integer("tier").notNull(),
  difficulty: integer("difficulty").notNull(),
  enabled: boolean("enabled").notNull(),
});

export const skillPrerequisites = pgTable(
  "skill_prerequisites",
  {
    skillSlug: text("skill_slug")
      .notNull()
      .references(() => skills.slug, { onDelete: "cascade" }),
    prerequisiteSlug: text("prerequisite_slug")
      .notNull()
      .references(() => skills.slug, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.skillSlug, table.prerequisiteSlug] })],
);

export const exercises = pgTable("exercises", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  mode: text("mode").notNull(),
  difficulty: integer("difficulty").notNull(),
});

export const exerciseSkills = pgTable(
  "exercise_skills",
  {
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug")
      .notNull()
      .references(() => skills.slug, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.exerciseId, table.skillSlug] })],
);

/** One row per learner and skill: the persisted `UserSkill` of the pedagogy engine. */
export const userSkills = pgTable(
  "user_skills",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug")
      .notNull()
      .references(() => skills.slug, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    mastery: doublePrecision("mastery").notNull(),
    accuracy: doublePrecision("accuracy").notNull(),
    strategy: doublePrecision("strategy").notNull(),
    fluency: doublePrecision("fluency").notNull(),
    retention: doublePrecision("retention").notNull(),
    transfer: doublePrecision("transfer").notNull(),
    attemptCount: integer("attempt_count").notNull(),
    lastAttemptAt: epoch("last_attempt_at"),
    nextReviewAt: epoch("next_review_at"),
    review: jsonb("review"),
    delayedRecallCount: integer("delayed_recall_count").notNull(),
    transferCount: integer("transfer_count").notNull(),
    seenContexts: jsonb("seen_contexts")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.skillSlug] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Calendar day the session is for, `YYYY-MM-DD`. */
    date: text("date").notNull(),
    seed: text("seed").notNull().default(""),
    startedAt: epoch("started_at").notNull(),
    finishedAt: epoch("finished_at"),
    abandoned: boolean("abandoned").notNull().default(false),
    /** XP for finishing the day's first completed session; 0 for any other. */
    bonusXp: integer("bonus_xp").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_date_idx").on(table.userId, table.date)],
);

export const attempts = pgTable(
  "attempts",
  {
    /** Client-generated, so a retried upload cannot count an attempt twice. */
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id),
    /**
     * The session the client says this attempt belongs to. Deliberately not a foreign key: a device
     * uploads attempts and sessions independently, so an attempt may arrive before its session.
     */
    sessionId: uuid("session_id"),
    finishedAt: epoch("finished_at").notNull(),
    success: boolean("success").notNull(),
    gaveUp: boolean("gave_up").notNull().default(false),
    strategy: text("strategy").notNull(),
    performanceScore: doublePrecision("performance_score").notNull(),
    /** The server-computed `AttemptMetrics`. */
    metrics: jsonb("metrics").notNull(),
    hintsUsed: integer("hints_used").notNull().default(0),
    /** The attempt was the scheduled review of one of its skills (computed server-side). */
    scheduledReview: boolean("scheduled_review").notNull().default(false),
    /** `performance.now()` of the client when the attempt started; event times are relative to it. */
    startedMs: doublePrecision("started_ms"),
    /** The learner's local calendar day, for XP decay, the daily cap and the streak. */
    localDay: text("local_day"),
    /** XP the server awarded (daily sessions only; 0 elsewhere). */
    xp: integer("xp").notNull().default(0),
    /** The session's combo after this attempt; null outside a session. */
    comboAfter: integer("combo_after"),
    /** Personal-best metrics this attempt improved. */
    improved: jsonb("improved")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attempts_user_finished_idx").on(table.userId, table.finishedAt),
    index("attempts_exercise_idx").on(table.exerciseId),
  ],
);

/** Every logical input of an attempt: enough to rebuild a ghost replay (AGENTS 11). */
export const attemptEvents = pgTable(
  "attempt_events",
  {
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    timestampMs: doublePrecision("timestamp_ms").notNull(),
    key: text("key").notNull(),
    code: text("code"),
    logicalKey: text("logical_key").notNull(),
    ctrl: boolean("ctrl").notNull(),
    alt: boolean("alt").notNull(),
    shift: boolean("shift").notNull(),
    meta: boolean("meta").notNull(),
    mode: text("mode").notNull(),
    cursorBeforeLine: integer("cursor_before_line").notNull(),
    cursorBeforeColumn: integer("cursor_before_column").notNull(),
    cursorAfterLine: integer("cursor_after_line").notNull(),
    cursorAfterColumn: integer("cursor_after_column").notNull(),
    accepted: boolean("accepted").notNull(),
  },
  (table) => [primaryKey({ columns: [table.attemptId, table.sequence] })],
);

export const sessionExercises = pgTable(
  "session_exercises",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id),
    skillSlug: text("skill_slug")
      .notNull()
      .references(() => skills.slug),
    block: text("block").notNull(),
    reason: text("reason").notNull().default(""),
    repeat: boolean("repeat").notNull().default(false),
    attemptId: uuid("attempt_id").references(() => attempts.id, { onDelete: "set null" }),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.position] })],
);

/** When each skill is next due; kept in step with `user_skills.review` so due work is one indexed read. */
export const reviewQueue = pgTable(
  "review_queue",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug")
      .notNull()
      .references(() => skills.slug, { onDelete: "cascade" }),
    dueAt: epoch("due_at").notNull(),
    stability: doublePrecision("stability").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.skillSlug] }),
    index("review_queue_due_idx").on(table.userId, table.dueAt),
  ],
);

/** Not in the T-601 list: per-exercise records, so they are not recomputed from every attempt. */
export const personalBests = pgTable(
  "personal_bests",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    time: doublePrecision("time"),
    efficiency: doublePrecision("efficiency"),
    performance: doublePrecision("performance"),
    reaction: doublePrecision("reaction"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.exerciseId] })],
);

/**
 * What the game layer had earned on a device before it could be recomputed from uploaded attempts
 * (the one-time adoption of ADR-0003 section 8). The server adds its own totals to this baseline.
 */
export const userGamification = pgTable("user_gamification", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  baselineXp: integer("baseline_xp").notNull().default(0),
  baselineBestCombo: integer("baseline_best_combo").notNull().default(0),
  baselineStreak: jsonb("baseline_streak"),
});
