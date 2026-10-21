import { z } from "zod";
import { PROFILE_VERSION, SESSION_BLOCKS, type Profile } from "@tutor-nvim/pedagogy";
import {
  attemptRecordSchema,
  calibrationResultSchema,
  comboStateSchema,
  count,
  dailySessionSchema,
  epochMs,
  experienceSchema,
  gamificationStateSchema,
  id,
  keyboardLayoutSchema,
  learnerStateSchema,
  personalBestMetricSchema,
  personalBestSchema,
  sessionHistoryEntrySchema,
  sessionItemSchema,
  sessionRewardsSchema,
} from "@tutor-nvim/shared";

/**
 * The stored profile is external input (a person can edit localStorage, and an older build wrote
 * it), so it is validated like any other boundary instead of being trusted as `Profile`.
 * `satisfies z.ZodType<Profile>` keeps this schema and the domain type from drifting apart. The
 * pieces that also travel over the API live in `@tutor-nvim/shared`.
 */
const sessionRun = z.object({
  date: z.string(),
  plan: dailySessionSchema,
  pending: z.array(sessionItemSchema.extend({ repeat: z.boolean() })),
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
      improved: z.array(personalBestMetricSchema),
      at: epochMs,
      xp: count.optional(),
    }),
  ),
  inSession: z.array(z.object({ skillId: id, dueAtIndex: count })),
  repeats: z.record(z.string(), count),
});

export const profileSchema = z.object({
  version: z.literal(PROFILE_VERSION),
  userId: id,
  createdAt: epochMs,
  settings: z.object({ keyboardLayout: keyboardLayoutSchema }),
  onboarding: z.object({
    completed: z.boolean(),
    experience: experienceSchema.nullable(),
    calibration: calibrationResultSchema.nullable(),
    completedAt: epochMs.nullable(),
  }),
  learner: learnerStateSchema,
  history: z.array(attemptRecordSchema),
  personalBests: z.record(z.string(), personalBestSchema),
  activeSession: z
    .object({
      run: sessionRun,
      startedAt: epochMs,
      combo: comboStateSchema,
      rewards: sessionRewardsSchema.nullable(),
    })
    .nullable(),
  sessions: z.array(sessionHistoryEntrySchema),
  gamification: gamificationStateSchema,
}) satisfies z.ZodType<Profile>;
