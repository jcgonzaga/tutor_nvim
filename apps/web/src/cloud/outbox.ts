import { z } from "zod";
import {
  attemptSubmissionSchema,
  sessionSubmissionSchema,
  type AttemptSubmission,
  type SessionSubmission,
} from "@tutor-nvim/shared";
import type { KeyValueStorage } from "../storage/profileStore";

/**
 * What happened on this device and has not reached the server yet. Attempts are the source of
 * truth for cloud progress, so they queue until the server has acknowledged them. It lives under its
 * own storage key, apart from the profile: it is sync plumbing, not learner state.
 */
export interface Outbox {
  readonly attempts: readonly AttemptSubmission[];
  readonly sessions: readonly SessionSubmission[];
}

export const EMPTY_OUTBOX: Outbox = { attempts: [], sessions: [] };
export const OUTBOX_KEY = "tutor-nvim:outbox";

/**
 * Cap on waiting attempts (about 3 KB each), so a long offline spell cannot fill localStorage.
 * When exceeded the oldest are dropped: they only lose their detailed replay, the newest evidence stays.
 */
export const MAX_QUEUED_ATTEMPTS = 300;
export const MAX_QUEUED_SESSIONS = 60;

export function enqueueAttempt(outbox: Outbox, attempt: AttemptSubmission): Outbox {
  if (outbox.attempts.some((queued) => queued.id === attempt.id)) return outbox;
  return { ...outbox, attempts: [...outbox.attempts, attempt].slice(-MAX_QUEUED_ATTEMPTS) };
}

/** A session is queued by id: the latest version (for example, once finished) replaces the older. */
export function enqueueSession(outbox: Outbox, session: SessionSubmission): Outbox {
  const others = outbox.sessions.filter((queued) => queued.id !== session.id);
  return { ...outbox, sessions: [...others, session].slice(-MAX_QUEUED_SESSIONS) };
}

export function removeAttempts(outbox: Outbox, ids: ReadonlySet<string>): Outbox {
  return { ...outbox, attempts: outbox.attempts.filter((attempt) => !ids.has(attempt.id)) };
}

export function removeSession(outbox: Outbox, session: SessionSubmission): Outbox {
  // Only the version that was sent: a newer one queued meanwhile must stay.
  return {
    ...outbox,
    sessions: outbox.sessions.filter((queued) => queued !== session),
  };
}

export const isOutboxEmpty = (outbox: Outbox): boolean =>
  outbox.attempts.length === 0 && outbox.sessions.length === 0;

const outboxSchema = z.object({
  attempts: z.array(attemptSubmissionSchema),
  sessions: z.array(sessionSubmissionSchema),
});

export function loadOutbox(storage: KeyValueStorage): Outbox {
  try {
    const text = storage.getItem(OUTBOX_KEY);
    if (text === null) return EMPTY_OUTBOX;
    const parsed = outboxSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : EMPTY_OUTBOX;
  } catch {
    return EMPTY_OUTBOX;
  }
}

export function saveOutbox(storage: KeyValueStorage, outbox: Outbox): boolean {
  try {
    if (isOutboxEmpty(outbox)) storage.removeItem(OUTBOX_KEY);
    else storage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
    return true;
  } catch {
    return false;
  }
}
