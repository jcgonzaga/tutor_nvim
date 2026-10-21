# ADR-0003 — Local/cloud synchronization: the server recomputes, the server wins

Status: accepted (M6, T-608).

## Context

The product plays entirely on the device (no network in the keypress path, AGENTS 10/25) and must
also follow a learner across devices. Scores calculated by a client are untrusted (AGENTS 26).

## Decision

1. **The client uploads what the learner did, never what it scored.** A finished attempt is sent as
   its logical inputs (`key`, `code`, modifiers, timestamp) and hints. The server replays them
   through the same Vim engine and evaluation, then applies the result with the same pedagogy code.
   Mastery, strategy, metrics, review dates and personal bests are all server-computed.
   An integration test checks that, for the same attempts, the server's learner state equals the
   device's to the last decimal.
2. **The server is authoritative for persisted progress.** After uploading, a device replaces its
   local progress (learner, history, personal bests, session history, onboarding) with the server
   snapshot (`GET /api/progress`). Only the session in play and `createdAt` stay local.
3. **Offline first.** An attempt is applied locally first (so feedback is immediate), then queued
   in an _outbox_ (its own storage key). The outbox is emptied only by a server acknowledgement.
   Uploads are idempotent on a client-generated attempt id, so retrying is always safe.
4. **A snapshot never undoes a newer local attempt.** If something finished while the snapshot was
   in flight, the sync uploads it and fetches again instead of applying the stale snapshot.
5. **Two devices merge by replay.** Attempts from several devices are applied in finish-time order;
   one uploaded late is clamped to the skill's last attempt so history stays chronological, and a
   `finishedAt` in the future is clamped to server time (+5 min of clock skew).
6. **Poison attempts do not block the queue.** A 4xx on a batch is retried one by one and the
   rejected attempt is dropped (and counted), instead of failing forever.
7. **Onboarding** is pushed by a device that finished it when the account has not; the server
   derives the placement from the calibration result and ignores any list of "placed" skills.
8. **Legacy adoption.** Progress earned before uploads existed (the M5 local-only product) has no
   attempts to replay. It is accepted **once**, only into an account with no progress and only
   while nothing is queued (queued attempts are already inside the local learner and would be
   counted twice), through `POST /api/progress/import`. After that the server refuses it (409).
   This is the one place the server takes client-stated values; they are range-checked, unknown
   skills/exercises are dropped, and stages are recomputed.

9. **The game layer is recomputed by the server too (M8).** XP, combo, daily bonus, streak, best
   runs and recent personal bests are not synced as numbers; they are derived from the uploaded
   attempts and sessions by the same pure functions the device uses (`computeAttemptReward`,
   `recordCompletedDay`). Each attempt carries the learner's **local day** (`localDay`), which the
   server cannot know and which XP decay, the daily cap and the streak depend on (without it the
   UTC day is used). Only attempts that belong to a daily session earn XP and combo; the combo of a
   session is rebuilt from the attempts already recorded in it; the daily bonus is paid when a
   session is submitted finished and not abandoned, once per local day; the streak is replayed over
   the days with a completed session. A client-stated XP figure is never read (the field, if sent,
   is dropped). The one exception is the one-time legacy adoption (section 8), which now also carries
   the old XP, best combo and streak as a **baseline** the server adds its own totals to. An
   integration test plays several days (failures, a strong hint, a forgiven gap, a long gap) on a
   device and checks that the server's recomputation equals what the device had shown.

## Consequences

- A learner can forge a perfect key sequence. That is acceptable for private learning progress and
  must be revisited before any competitive ranking (AGENTS 26).
- Local progress that cannot be uploaded and is not adopted (a second device with legacy progress
  signing into an account that already has its own) is replaced by the server's. This is the
  "server wins" rule and is covered by a test; no UI warns about it yet.
- Settings other than onboarding (keyboard layout) are only synced as part of onboarding.
- XP depends on the order attempts are applied in. Two devices practicing the same exercise on the
  same day, uploaded in a different order than they happened, can split the repeat decay slightly
  differently than either device showed; the server's figure then wins on the next sync.
- Reviews are due by server data: the learner state a device builds sessions from is the
  server's after each sync, so two devices build the same daily session.
