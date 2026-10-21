import type { Attempt } from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import type { ActiveSession, Profile } from "@tutor-nvim/pedagogy";
import type { AttemptSubmission, SessionSubmission } from "@tutor-nvim/shared";

/**
 * What the server needs to replay an attempt: the logical inputs and the hints, never a score. The
 * server evaluates it again with the same engine, so the result cannot be inflated from the client.
 */
export function toAttemptSubmission(
  exercise: Pick<Exercise, "id">,
  attempt: Attempt,
  options: {
    id: string;
    finishedAt: number;
    solved: boolean;
    sessionId?: string | null;
    /** The learner's local calendar day, `YYYY-MM-DD`. */
    localDay?: string;
  },
): AttemptSubmission {
  return {
    id: options.id,
    exerciseId: exercise.id,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    // An attempt that ended without meeting the goal can only have ended by giving up.
    gaveUp: !options.solved,
    finishedAt: options.finishedAt,
    localDay: options.localDay ?? null,
    sessionId: options.sessionId ?? null,
    events: attempt.events.map((event) => ({
      key: event.key,
      code: event.code,
      ctrl: event.ctrl,
      alt: event.alt,
      shift: event.shift,
      meta: event.meta,
      timestamp: event.timestamp,
    })),
    hints: attempt.hints.map((hint) => ({ level: hint.level, timestamp: hint.timestamp })),
  };
}

/** Four independent 32-bit mixes of the text, enough bits that two different inputs never collide in practice. */
function hash128(text: string): number[] {
  const seeds = [0x9e3779b1, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f];
  return seeds.map((seed) => {
    let h = seed ^ text.length;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
      h ^= h >>> 15;
    }
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  });
}

/**
 * A stable UUID derived from text. A session has no id in the local profile, and its attempts and
 * its summary are uploaded separately, so both compute the same id from the session's identity
 * instead of storing one.
 */
export function deterministicUuid(text: string): string {
  const parts = hash128(text).map((value) => value.toString(16).padStart(8, "0"));
  const hex = parts.join("");
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The id of the session in play. `createdAt` is stable on a device; `startedAt` tells sessions apart. */
export const sessionIdOf = (profile: Pick<Profile, "createdAt">, active: ActiveSession): string =>
  deterministicUuid(`session|${profile.createdAt}|${active.startedAt}`);

/** The summary of the session in play, as it stands (finished or abandoned when `finishedAt` is set). */
export function toSessionSubmission(
  profile: Pick<Profile, "createdAt">,
  active: ActiveSession,
  options: { finishedAt: number | null; abandoned: boolean },
): SessionSubmission {
  return {
    id: sessionIdOf(profile, active),
    date: active.run.date,
    seed: active.run.plan.seed,
    startedAt: active.startedAt,
    finishedAt: options.finishedAt,
    abandoned: options.abandoned,
    items: active.run.completed.map((item, position) => ({
      exerciseId: item.exerciseId,
      skillId: item.skillId,
      block: item.block,
      reason: item.repeat ? "repeat" : item.block,
      position,
      repeat: item.repeat,
    })),
  };
}
