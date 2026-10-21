import { describe, expect, it } from "vitest";
import { attemptSubmissionSchema, sessionSubmissionSchema } from "@tutor-nvim/shared";
import { memoryStorage } from "../storage/profileStore";
import {
  EMPTY_OUTBOX,
  MAX_QUEUED_ATTEMPTS,
  OUTBOX_KEY,
  enqueueAttempt,
  enqueueSession,
  isOutboxEmpty,
  loadOutbox,
  removeAttempts,
  removeSession,
  saveOutbox,
} from "./outbox";

const attempt = (n: number) =>
  attemptSubmissionSchema.parse({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    exerciseId: "vim-mode-normal-001",
    startedAt: 0,
    completedAt: 10,
    finishedAt: 1000 + n,
    events: [{ key: "Escape", timestamp: 10 }],
  });
const session = (n: number, finishedAt: number | null = null) =>
  sessionSubmissionSchema.parse({
    id: `00000000-0000-4000-8000-${String(900 + n).padStart(12, "0")}`,
    date: "2026-10-21",
    startedAt: 1,
    finishedAt,
    items: [],
  });

describe("outbox", () => {
  it("queues an attempt once, however many times it is offered", () => {
    const once = enqueueAttempt(EMPTY_OUTBOX, attempt(1));
    expect(enqueueAttempt(once, attempt(1)).attempts).toHaveLength(1);
  });

  it("keeps only the newest attempts when too many are waiting", () => {
    let outbox = EMPTY_OUTBOX;
    for (let i = 0; i < MAX_QUEUED_ATTEMPTS + 5; i++) outbox = enqueueAttempt(outbox, attempt(i));
    expect(outbox.attempts).toHaveLength(MAX_QUEUED_ATTEMPTS);
    expect(outbox.attempts[0]?.id).toBe(attempt(5).id);
  });

  it("replaces a queued session with its newer version", () => {
    const open = session(1);
    const closed = session(1, 500);
    const outbox = enqueueSession(enqueueSession(EMPTY_OUTBOX, open), closed);
    expect(outbox.sessions).toEqual([closed]);
  });

  it("removes only what was sent: a newer version of a session stays queued", () => {
    const sent = session(1);
    const newer = session(1, 500);
    const outbox = enqueueSession(EMPTY_OUTBOX, newer);
    expect(removeSession(outbox, sent).sessions).toEqual([newer]);
    expect(removeSession(outbox, newer).sessions).toEqual([]);
    const withAttempts = enqueueAttempt(enqueueAttempt(EMPTY_OUTBOX, attempt(1)), attempt(2));
    expect(removeAttempts(withAttempts, new Set([attempt(1).id])).attempts).toEqual([attempt(2)]);
  });

  it("survives a reload through storage, and an empty outbox leaves no key behind", () => {
    const storage = memoryStorage();
    const outbox = enqueueSession(enqueueAttempt(EMPTY_OUTBOX, attempt(1)), session(1));
    expect(saveOutbox(storage, outbox)).toBe(true);
    expect(loadOutbox(storage)).toEqual(outbox);

    saveOutbox(storage, EMPTY_OUTBOX);
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();
    expect(isOutboxEmpty(loadOutbox(storage))).toBe(true);
  });

  it("treats a damaged outbox as empty instead of breaking the app", () => {
    const storage = memoryStorage();
    storage.setItem(OUTBOX_KEY, "{broken");
    expect(loadOutbox(storage)).toEqual(EMPTY_OUTBOX);
    storage.setItem(OUTBOX_KEY, JSON.stringify({ attempts: [{ nope: 1 }], sessions: [] }));
    expect(loadOutbox(storage)).toEqual(EMPTY_OUTBOX);
  });
});
