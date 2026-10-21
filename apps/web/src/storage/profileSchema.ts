import { z } from "zod";
import {
  EXPERIENCE_LEVELS,
  KEYBOARD_LAYOUTS,
  MASTERY_STAGES,
  PROFILE_VERSION,
  SESSION_BLOCKS,
  type Profile,
} from "@tutor-nvim/pedagogy";

/**
 * The stored profile is external input (a person can edit localStorage, and an older build wrote
 * it), so it is validated like any other boundary instead of being trusted as `Profile`.
 * `satisfies z.ZodType<Profile>` keeps this schema and the domain type from drifting apart.
 */
const count = z.number().int().nonnegative();
const score = z.number().min(0).max(100);
const epochMs = z.number().finite();
const id = z.string().min(1);

const reviewState = z.object({
  stability: z.number().positive(),
  difficulty: z.number().min(0).max(1),
  dueAt: epochMs,
  lastPerformance: score,
  streak: count,
});

const userSkill = z.object({
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
  review: reviewState.nullable(),
  delayedRecallCount: count,
  transferCount: count,
  seenContexts: z.array(z.string()),
});

const personalBestMetric = z.enum(["time", "efficiency", "performance", "reaction"]);

const personalBest = z.object({
  time: z.number().nullable(),
  efficiency: z.number().nullable(),
  performance: z.number().nullable(),
  reaction: z.number().nullable(),
});

const sessionItem = z.object({
  exerciseId: id,
  skillId: id,
  block: z.enum(SESSION_BLOCKS),
  reason: z.string(),
});

const dailySession = z.object({
  userId: id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seed: z.string(),
  warmup: z.array(sessionItem),
  reviews: z.array(sessionItem),
  learn: z.array(sessionItem),
  mixed: z.array(sessionItem),
  challenge: z.array(sessionItem),
});

const sessionRun = z.object({
  date: z.string(),
  plan: dailySession,
  pending: z.array(sessionItem.extend({ repeat: z.boolean() })),
  completed: z.array(
    z.object({
      exerciseId: id,
      skillId: id,
      skillIds: z.array(id),
      block: z.enum(SESSION_BLOCKS),
      repeat: z.boolean(),
      success: z.boolean(),
      performance: z.number(),
      scheduledReview: z.boolean(),
      improved: z.array(personalBestMetric),
      at: epochMs,
    }),
  ),
  inSession: z.array(z.object({ skillId: id, dueAtIndex: count })),
  repeats: z.record(z.string(), count),
});

const calibration = z.object({
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
});

export const profileSchema = z.object({
  version: z.literal(PROFILE_VERSION),
  userId: id,
  createdAt: epochMs,
  settings: z.object({ keyboardLayout: z.enum(KEYBOARD_LAYOUTS) }),
  onboarding: z.object({
    completed: z.boolean(),
    experience: z.enum(EXPERIENCE_LEVELS).nullable(),
    calibration: calibration.nullable(),
    completedAt: epochMs.nullable(),
  }),
  learner: z.object({
    skills: z.record(z.string(), userSkill),
    placed: z.array(id).optional(),
  }),
  history: z.array(
    z.object({
      exerciseId: id,
      skillIds: z.array(id),
      at: epochMs,
      success: z.boolean(),
      performance: z.number(),
    }),
  ),
  personalBests: z.record(z.string(), personalBest),
  activeSession: z.object({ run: sessionRun, startedAt: epochMs }).nullable(),
  sessions: z.array(
    z.object({
      date: z.string(),
      startedAt: epochMs,
      finishedAt: epochMs,
      exercises: count,
      successes: count,
      reviewsCompleted: count,
      abandoned: z.boolean(),
    }),
  ),
}) satisfies z.ZodType<Profile>;
