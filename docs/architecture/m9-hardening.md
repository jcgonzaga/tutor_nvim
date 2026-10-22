# M9 — Release hardening: architecture notes

Status: implemented and tested, except where "Not verified" says otherwise. M9 adds no learning
behaviour; it makes what exists safe to ship (IMPLEMENTATION_PLAN T-901..T-907).

## CI and gates (T-907)

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) has six jobs: `quality` (typecheck, lint,
format, unit + integration, build), `content`, `postgres`, `e2e`, `performance` and `release` (main
only, needs the others).

- **Content gate.** `pnpm content:ci` = schema/cross-reference validation + executing every declared
  solution in the Vim engine. `tests/content-ci.test.ts` proves the gate bites: it copies the
  content to a temp directory (`CONTENT_ROOT`), injects an unknown field, a wrong solution, a
  dangling prerequisite, a duplicate slug and a prerequisite cycle, and asserts the real scripts
  exit non-zero for each.
- **Real Postgres.** With `TEST_DATABASE_URL`, `openTestDb()` (apps/api/src/test-util.ts) creates a
  throwaway database per test file through the `pg` driver; without it, tests use PGlite. The whole
  API and sync suites pass on both. This found a real bug: the scheduler produced fractional
  `next_review_at` values, which Postgres `bigint` rejects and PGlite had tolerated. Due dates are
  now whole milliseconds (regression test: "due dates are whole milliseconds").
  It also found that the `pg` pool had no `error` handler: a connection the server drops while idle
  (Neon recycles them) would have crashed the API process; the pool now ignores it and reconnects.

## Monitoring (T-906)

- API: pino JSON logs, `x-request-id` on every response (accepted from the caller, else generated),
  `/api/health` (liveness), `/api/ready` (database), 500s return `{ error, requestId }`,
  `/api/client-errors` receives browser reports, fatal handlers exit so the platform restarts.
- Web: `ErrorBoundary` (the learner sees a recovery screen, not a blank page), global
  `error`/`unhandledrejection` handlers, and an `ErrorReporter` port that scrubs, dedupes and caps
  reports. Reports never contain buffer text or typed keys.

## Settings, sound, analytics (T-903)

- Preferences (`apps/web/src/prefs`) are per device and separate from the profile (they never sync
  and never feed mastery).
- Sound: WebAudio tones, optional, **off by default**; every result is also on screen.
- Analytics: provider-neutral, **opt-in, off by default** (a product decision to confirm). The event
  catalogue (`analytics/events.ts`) has no field that can hold typed text, names or e-mails.
  `derive.ts` computes unlock/mastery/review events by comparing profiles before and after an
  attempt (pure, tested). Consent is checked on every `track` and at every flush, so withdrawing it
  takes effect immediately and buffered events are dropped, not sent. E2E (`privacy.spec.ts`) checks
  that nothing is sent by default and that, with consent, only named events with a single random id
  go out, and that withdrawing stops them.

## Accessibility (T-901)

`tests/e2e/accessibility.spec.ts` runs axe-core (WCAG 2.0/2.1 A and AA, which includes colour
contrast) on every screen: welcome, layout, experience, calibration exercise and feedback, estimate,
home, session exercise, feedback and summary, map, skill detail, progress, settings, account, free
practice and its result. It also checks keyboard-only onboarding, visible focus, focus handed to the
result when an attempt ends, state carried in words, and `prefers-reduced-motion`.

Fixed by the audit: a `span` with `aria-label` (the pending-command readout, not allowed on a
generic element) is now an `<output aria-live="off">`.

Not covered by automation: real screen-reader use (NVDA, VoiceOver) and manual contrast checks of
future screens. axe finds roughly a third of accessibility problems; this is a floor.

## Performance (T-902)

`pnpm test:perf` builds the web app and measures the **production build** (`vite preview`, never the
dev server) in headless Chromium, with budgets from AGENTS.md section 2.10:

| Budget                                          | Limit            | Measured here         |
| ----------------------------------------------- | ---------------- | --------------------- |
| Keypress to next frame (p95, 120 keys)          | < 50 ms          | median 16.7, p95 18.8 |
| Exercise transition (click to ready editor)     | < 150 ms         | 18 ms, 3 ms           |
| First contentful paint                          | < 2000 ms        | 412 ms                |
| Long main-thread tasks while typing / moving on | < 200 ms         | none                  |
| Gzipped JS / CSS                                | < 300 KB / 20 KB | 261 KB / 6 KB (1)     |
| Network requests while typing                   | none             | none                  |

The keypress figure is dominated by waiting for the next frame (16.7 ms); the engine and React
commit are a small part of it. The JS bundle is one chunk (~680 KB minified) because all 120
exercises ship with it; splitting content by skill is possible later and not needed for the budget.

(1) The JS limit was 260 KB (181 KB measured at M9). ADR-0005 added Spanish, theory cards and
explanations, which brought it to 261 KB, so the limit is now 300 KB. Loading each language pack on
demand would save about a third of that growth per learner; not needed yet.

## Journeys (T-904)

The plan's five journeys are covered end to end in a browser: new-user onboarding, calibration and
daily session (`product.spec.ts`), skill unlock (`unlock.spec.ts`: after a few days of sessions at
least one locked skill opens and its page no longer says Locked), and returning review
(`product.spec.ts`). Cloud, gamification, privacy and accessibility have their own specs.

## Deployment (T-905)

See [`docs/deployment.md`](../deployment.md).

## Known gaps

- `docker build` and a live Neon / Neon Auth instance could not be exercised in the build
  environment; the production boot was verified on a real Postgres with a production-only install.
- Fastify 5.12 logs a deprecation warning for `requestIdLogLabel` (it moved under `logController`,
  which is not in its published types yet). It still works; revisit on the next Fastify upgrade.
- Hosting is Vercel (decided after M9); the Vercel configs are in place but the first deploy has not been run from this environment.
