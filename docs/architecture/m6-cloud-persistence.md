# M6 — Cloud persistence: architecture notes

Status: implemented and tested end to end against an in-process Postgres. **Not yet exercised
against a live Neon project or a live Neon Auth instance** — that needs credentials (see
"Going live"). Decisions: [ADR-0001 auth](adr/0001-auth-neon-auth.md),
[ADR-0002 Drizzle](adr/0002-drizzle-orm.md), [ADR-0003 sync](adr/0003-sync-model.md).

```text
 browser (offline-first)                          apps/api (Fastify)                 Neon Postgres
 ───────────────────────                          ──────────────────                 ─────────────
 practice ─► apply locally ─► outbox ──POST /api/attempts──► replay + evaluate
                                  ▲                              recordAttempt ───► user_skills,
 Profile ◄── replace with ◄──── GET /api/progress ◄── snapshot ◄───────────────── attempts, events,
 (localStorage)  snapshot                                                          review_queue, …
        Authorization: Bearer <Neon Auth JWT>  ──►  jose + JWKS  ──►  users.auth_user_id = sub
```

## Packages

| Path                 | Responsibility                                                                 |
| -------------------- | ------------------------------------------------------------------------------ |
| `packages/shared`    | Zod schemas shared by web and API: profile pieces and API request/response     |
| `apps/api`           | Fastify app, Drizzle schema + migrations, services, routes, Neon Auth verifier |
| `apps/web/src/cloud` | Auth client, API client, outbox, merge, sync loop, provider, account screen    |

`apps/api` depends on the domain packages (`evaluation`, `pedagogy`, `vim-engine`,
`exercise-schema`) and never re-implements them: it calls `startAttempt`/`advanceAttempt`/
`evaluateAttempt`, `recordAttempt`, `updatePersonalBest`, `buildDailySession`, `placedSkills`.

## Database (T-601)

Tables: `users`, `user_settings`, `skills`, `skill_prerequisites`, `exercises`, `exercise_skills`,
`user_skills`, `attempts`, `attempt_events`, `sessions`, `session_exercises`, `review_queue`, plus
`personal_bests` (not in the plan: per-exercise records, so they are not recomputed from every
attempt). Skills and exercises mirror the validated YAML at start-up (`syncContent`, idempotent)
so attempts have foreign keys; the YAML stays the source of truth and is validated before the API
starts. Skills are referenced by `slug`, as the pedagogy engine keys them. Scheduling times are epoch
milliseconds (`bigint`), as the domain uses them.

`attempts.session_id` is intentionally **not** a foreign key: a device uploads attempts and
sessions independently, so an attempt can arrive before its session; the link is made by
`POST /api/sessions` or when the attempt is recorded, whichever comes second.
`attempt_events` stores every logical input with cursor before/after and `accepted`
(AGENTS 11), enough for a future ghost replay.

## Endpoints

All under `Authorization: Bearer <JWT>` except health. Global rate limit, stricter on writes.

| Endpoint                                 | Ticket | Notes                                                                  |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `GET /api/health`                        |        | open                                                                   |
| `GET /api/me`, `PUT /api/me/settings`    | T-603  | provisions the user; settings derive the placement server-side         |
| `GET /api/skills`, `GET /api/skills/:id` | T-604  | `:id` is the skill id or slug                                          |
| `GET /api/progress`                      | T-607  | the authoritative snapshot (learner, history, game layer since M8)     |
| `POST /api/progress/import`              | T-608  | one-time legacy adoption (ADR-0003 §8)                                 |
| `GET /api/session/daily?date=`           | T-605  | built with the shared deterministic builder, stored, same answer twice |
| `POST /api/sessions`                     | T-605  | idempotent on the client's session id                                  |
| `POST /api/attempts`                     | T-606  | batch (the outbox), idempotent on attempt id                           |
| `POST /api/attempts/:id/complete`        | T-606  | single                                                                 |

**Deviation from the plan (T-606):** "create" and "complete" are one step. The client plays an
attempt locally and uploads it finished, so a separate "started" record would only exist to be
completed a moment later. Events travel with the completion, which the plan allows for the MVP.

The web client does not use `GET /api/session/daily`: it builds the same session locally with the
same builder (a test asserts server and client plans are identical for the same state), which also
works offline. The endpoint is for other clients and for that parity check.

## Security notes

- Bodies are parsed with Zod (`MAX_ATTEMPT_EVENTS = 2000`, batches ≤ 100, 4 MB body limit).
- CORS only allows the configured web origins. Rate limit: 300/min/client, 60/min on writes.
- Users only ever read and write their own rows (every query is scoped by the authenticated user
  id); a test checks that one user cannot see another's progress or reuse another's attempt id.
- No arbitrary shell or code runs on the server (AGENTS 26). Config is validated at start-up and
  production refuses fake auth and the in-memory database.

## Web

Cloud sync is optional: without `VITE_API_URL` the app is exactly the M5 local product and shows
nothing about accounts. With it, Home shows "Sign in" and the sync status; the welcome step offers
"I already have an account" (signing in before onboarding brings the account's onboarding with it).
Sync runs after sign-in, shortly after each finished attempt/session, when the browser goes back
online, and every 5 minutes. Practice never waits for it.

## Tests

- API (`apps/api`): migrations, content mirror, auth (including real signed EdDSA tokens against a
  local JWKS server), settings/placement, attempts (replay, idempotency, ownership, clamping,
  chronology, concurrent uploads), sessions, progress isolation, legacy import, config rules,
  rate limiting, CORS.
- Integration (`tests/cloud-sync.test.ts`): the real web sync client against the real API — server
  state equals device state; two devices converge; offline; an attempt finished mid-sync is not
  undone (mutation-checked); poison attempt; legacy adoption.
- Web unit: outbox, Better Auth client (fake `fetch`), submission ids, merge/config.
- E2E (`tests/e2e/cloud.spec.ts`): the real API and web app together — progress on one browser
  appears on another; practice offline then upload; sign out.

## Going live

1. Create a Neon project, enable Neon Auth, and note the **Auth URL** (Console → Settings →
   Better Auth) and the pooled connection string.
2. API env (`apps/api/.env.example`): `DATABASE_URL`, `AUTH_MODE=neon`, `NEON_AUTH_BASE_URL`,
   `CORS_ORIGIN`. Add the web origin to Neon Auth's trusted origins.
3. Web env (`apps/web/.env.example`): `VITE_API_URL`, `VITE_NEON_AUTH_URL`.
4. Run `pnpm --filter @tutor-nvim/api start`; migrations apply automatically.
5. Verify by hand: sign up, finish an exercise, check `GET /api/progress`. If the token call fails,
   see ADR-0001 "Consequences".

Hosting of the API (Fly/Railway/Render) is deliberately not decided here (PRD 44: not blocking).

## Since M8

The snapshot also carries the game layer (XP, streak, combo, records), recomputed by the server from
the uploaded attempts and sessions; attempts now carry the learner's local day. See
[ADR-0003 section 9](adr/0003-sync-model.md) and [m8-gamification](m8-gamification.md). Migration
`0001` adds the columns and the `user_gamification` baseline table.

## Known limitations

- Not run against live Neon / Neon Auth (see above).
- Concurrency locking is not provable on single-connection PGlite.
- Client-supplied key sequences are replayed but not proven human; fine for private progress.
- Only onboarding settings sync; no UI for password reset / email verification.
- Local progress on a second device that can neither be uploaded nor adopted is replaced silently.
- The outbox keeps at most 300 attempts; a very long offline spell drops the oldest replays.
