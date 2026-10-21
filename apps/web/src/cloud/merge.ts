import { DEFAULT_PEDAGOGY_CONFIG, type Profile } from "@tutor-nvim/pedagogy";
import type { ProgressSnapshot, Settings } from "@tutor-nvim/shared";

/** The settings and onboarding outcome this device would give the server. */
export function settingsOf(profile: Profile): Settings {
  return {
    keyboardLayout: profile.settings.keyboardLayout,
    experience: profile.onboarding.experience,
    calibration: profile.onboarding.calibration,
    onboardingCompletedAt: profile.onboarding.completedAt,
  };
}

/**
 * Replaces local progress with the server's (T-608): for persisted mastery the server is
 * authoritative, because it recomputed every attempt itself. What only exists on this device stays:
 * the session in play and `createdAt`.
 *
 * Onboarding is the one exception. A server that has never seen the learner finish it (`null`)
 * does not erase a completed local onboarding; the sync pushes it up first, so this only keeps the
 * profile coherent in between.
 */
export function applySnapshot(profile: Profile, snapshot: ProgressSnapshot): Profile {
  const { settings } = snapshot;
  const serverOnboarded = settings.onboardingCompletedAt !== null;
  return {
    ...profile,
    userId: snapshot.userId,
    settings: { ...profile.settings, keyboardLayout: settings.keyboardLayout },
    onboarding: serverOnboarded
      ? {
          completed: true,
          experience: settings.experience,
          calibration: settings.calibration,
          completedAt: settings.onboardingCompletedAt,
        }
      : profile.onboarding,
    learner: snapshot.learner,
    history: mergeHistory(profile, snapshot),
    gamification: mergeGamification(profile, snapshot),
    personalBests: snapshot.personalBests,
    sessions: snapshot.sessions,
  };
}

/**
 * Server history, plus whatever this device remembers from before the first attempt the server
 * knows about. That older part exists only for progress adopted from a pre-sync profile, which has
 * no replayable attempts but should still count in "exercises attempted" and recent-repetition.
 */
function mergeHistory(profile: Profile, snapshot: ProgressSnapshot): Profile["history"] {
  const first = snapshot.history[0]?.at ?? Number.POSITIVE_INFINITY;
  const earlier = profile.history.filter((entry) => entry.at < first);
  return [...earlier, ...snapshot.history].slice(-DEFAULT_PEDAGOGY_CONFIG.profile.maxHistory);
}

/**
 * The server recomputed XP, combo, streak and records from the uploaded attempts, so its numbers
 * win. One thing only this device may still hold: best runs of exercises played before attempts
 * could be uploaded. They are kept where the server has no better one, so "your best" does not
 * disappear on the first sync.
 */
function mergeGamification(profile: Profile, snapshot: ProgressSnapshot): Profile["gamification"] {
  const bestRuns = { ...snapshot.gamification.bestRuns };
  for (const [exerciseId, local] of Object.entries(profile.gamification.bestRuns)) {
    const server = bestRuns[exerciseId];
    if (!server || local.performance > server.performance) bestRuns[exerciseId] = local;
  }
  return { ...snapshot.gamification, bestRuns };
}
