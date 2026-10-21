import { eq, sql } from "drizzle-orm";
import type { ContentBundle } from "@tutor-nvim/exercise-schema";
import { placedSkills, refreshStages } from "@tutor-nvim/pedagogy";
import {
  experienceSchema,
  keyboardLayoutSchema,
  calibrationResultSchema,
  type Me,
  type Settings,
} from "@tutor-nvim/shared";
import type { AuthIdentity } from "../auth/verifier";
import type { Db } from "../db/client";
import { userSettings, users } from "../db/schema";
import { HttpError } from "../errors";
import { hasProgress } from "./legacy";
import { loadLearner, saveLearner } from "./learner";

/** Just-in-time provisioning: the first authenticated request creates the user and its settings. */
export async function ensureUser(
  db: Db,
  identity: AuthIdentity,
): Promise<{ id: string; authUserId: string; email: string | null }> {
  const [row] = await db
    .insert(users)
    .values({ authUserId: identity.authUserId, email: identity.email })
    .onConflictDoUpdate({
      target: users.authUserId,
      set: { email: sql`coalesce(excluded.email, ${users.email})` },
    })
    .returning({ id: users.id, authUserId: users.authUserId, email: users.email });
  if (!row) throw new HttpError(500, "internal", "Could not provision the user");
  await db.insert(userSettings).values({ userId: row.id }).onConflictDoNothing();
  return row;
}

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!row) throw new HttpError(404, "not_found", "No settings for this user");
  return {
    keyboardLayout: keyboardLayoutSchema.catch("us-ansi").parse(row.keyboardLayout),
    experience: experienceSchema.nullable().catch(null).parse(row.experience),
    calibration: calibrationResultSchema.nullable().catch(null).parse(row.calibration),
    onboardingCompletedAt: row.onboardingCompletedAt,
  };
}

export async function getMe(
  db: Db,
  user: { id: string; authUserId: string; email: string | null },
): Promise<Me> {
  return {
    id: user.id,
    authUserId: user.authUserId,
    email: user.email,
    settings: await getSettings(db, user.id),
    hasProgress: await hasProgress(db, user.id),
  };
}

/**
 * Stores the learner's settings and onboarding outcome. The placement is *derived* here from the
 * calibration result and the known skills; a client cannot unlock skills by sending its own list.
 * Placement carries no evidence: it only changes which skills are unlocked.
 */
export async function updateSettings(
  db: Db,
  bundle: ContentBundle,
  userId: string,
  settings: Settings,
): Promise<Settings> {
  await db.transaction(async (tx) => {
    const placed = settings.calibration ? placedSkills(bundle.skills, settings.calibration) : [];
    await tx
      .update(userSettings)
      .set({
        keyboardLayout: settings.keyboardLayout,
        experience: settings.experience,
        calibration: settings.calibration,
        placed,
        onboardingCompletedAt: settings.onboardingCompletedAt,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, userId));

    const learner = await loadLearner(tx, userId);
    await saveLearner(tx, userId, refreshStages(bundle.skills, learner));
  });
  return getSettings(db, userId);
}
