import type { Profile } from "@tutor-nvim/pedagogy";
import { MAX_ATTEMPTS_PER_BATCH, type AttemptSubmission } from "@tutor-nvim/shared";
import { ApiError, NetworkError, type CloudApi } from "./api";
import { applySnapshot, settingsOf } from "./merge";
import { isOutboxEmpty, removeAttempts, removeSession, type Outbox } from "./outbox";

export type SyncOutcome =
  | { readonly status: "synced"; readonly rejected: number }
  | { readonly status: "offline" }
  | { readonly status: "signed-out" }
  | { readonly status: "error"; readonly message: string };

export interface SyncDeps {
  readonly api: CloudApi;
  readonly getProfile: () => Profile;
  readonly getOutbox: () => Outbox;
  readonly setOutbox: (outbox: Outbox) => void;
  /** Applies a pure transition to the stored profile. */
  readonly updateProfile: (transition: (profile: Profile) => Profile) => void;
}

/** Times the loop starts over because new work was queued while it was talking to the server. */
const MAX_PASSES = 4;

const isClientError = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 401 &&
  error.status !== 429;

/**
 * Brings this device and the server into agreement (T-608):
 *
 * 1. make sure the server knows who this is and, if only this device has finished onboarding, tell
 *    it (the server derives the placement itself);
 * 2. upload what happened here: attempts first (the server replays them), then session summaries;
 * 3. replace local progress with the server's snapshot.
 *
 * The snapshot is only applied while nothing new is waiting in the outbox. An attempt finished
 * during the round trip is already reflected locally but not in the snapshot, so applying the
 * snapshot then would silently undo it: the loop uploads it and fetches again instead.
 *
 * Nothing here runs in the keypress path, and a failure never touches local progress: offline
 * practice keeps working and the outbox keeps everything until the server has acknowledged it.
 */
export async function runSync(deps: SyncDeps): Promise<SyncOutcome> {
  const { api } = deps;
  let rejected = 0;
  try {
    const me = await api.me();
    const local = deps.getProfile();
    if (local.onboarding.completed && me.settings.onboardingCompletedAt === null) {
      await api.putSettings(settingsOf(local));
    }

    // Progress earned before uploads existed cannot be replayed. It is adopted once, by an account
    // with none, and only while nothing is queued (queued attempts are already part of the local
    // learner, and the server will replay them itself, so importing too would count them twice).
    if (!me.hasProgress && isOutboxEmpty(deps.getOutbox()) && hasLocalEvidence(deps.getProfile())) {
      await adoptLocalProgress(deps);
    }

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      rejected += await uploadAttempts(deps);
      await uploadSessions(deps);
      if (!isOutboxEmpty(deps.getOutbox())) continue;

      const snapshot = await api.progress();
      // Something finished while the snapshot was in flight: upload it before replacing anything.
      if (!isOutboxEmpty(deps.getOutbox())) continue;
      deps.updateProfile((profile) => applySnapshot(profile, snapshot));
      return { status: "synced", rejected };
    }
    // Still busy after several passes: keep what is local; the next sync will settle it.
    return { status: "synced", rejected };
  } catch (error) {
    if (error instanceof NetworkError) return { status: "offline" };
    if (error instanceof ApiError && error.status === 401) return { status: "signed-out" };
    return { status: "error", message: error instanceof Error ? error.message : "Sync failed" };
  }
}

const hasLocalEvidence = (profile: Profile): boolean =>
  Object.values(profile.learner.skills).some((skill) => skill.attemptCount > 0);

async function adoptLocalProgress(deps: SyncDeps): Promise<void> {
  const { learner, personalBests } = deps.getProfile();
  try {
    await deps.api.importLegacy({ learner, personalBests });
  } catch (error) {
    // Another device got there first: the server's progress wins, as it always does.
    if (!(error instanceof ApiError && error.status === 409)) throw error;
  }
}

async function uploadAttempts(deps: SyncDeps): Promise<number> {
  let rejected = 0;
  while (true) {
    const batch = deps.getOutbox().attempts.slice(0, MAX_ATTEMPTS_PER_BATCH);
    if (batch.length === 0) return rejected;
    try {
      await deps.api.postAttempts(batch);
      deps.setOutbox(removeAttempts(deps.getOutbox(), new Set(batch.map((attempt) => attempt.id))));
    } catch (error) {
      if (!isClientError(error)) throw error;
      // One malformed attempt would otherwise block every later one for good: find it and drop it.
      rejected += await uploadOneByOne(deps, batch);
    }
  }
}

async function uploadOneByOne(
  deps: SyncDeps,
  batch: readonly AttemptSubmission[],
): Promise<number> {
  let rejected = 0;
  for (const attempt of batch) {
    try {
      await deps.api.postAttempts([attempt]);
    } catch (error) {
      if (!isClientError(error)) throw error;
      rejected += 1;
    }
    deps.setOutbox(removeAttempts(deps.getOutbox(), new Set([attempt.id])));
  }
  return rejected;
}

async function uploadSessions(deps: SyncDeps): Promise<void> {
  for (const session of deps.getOutbox().sessions) {
    try {
      await deps.api.postSession(session);
    } catch (error) {
      if (!isClientError(error)) throw error;
    }
    deps.setOutbox(removeSession(deps.getOutbox(), session));
  }
}
