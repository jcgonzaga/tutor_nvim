# M5 — Local product MVP: architecture notes

Status: implemented. A learner can onboard, calibrate, complete a daily session, progress skills,
close the app, and come back to stored reviews, **without a cloud account**. Everything is local:
the profile lives in `localStorage`, nothing is sent anywhere, and no request is made per keypress.

```text
 onboarding ─► calibration ─► initial estimate (placement)
                                   │
 daily home ─► session run ─► feedback ─► summary
      │            │
      ▼            ▼
   Profile (plain JSON, versioned) ◄── pure reducers in @tutor-nvim/pedagogy
      │
      ▼
 localStorage  (Zod-validated on load; unreadable data is backed up, never overwritten)
```

React only renders and dispatches. Every rule below lives in `packages/pedagogy` or
`packages/evaluation` and has unit tests; `apps/web` adds storage, routing and screens.

## Domain additions (`packages/pedagogy`, `packages/evaluation`)

| Module             | What it does                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `calibration.ts`   | Adaptive staircase over a 4-rung ladder; self-reported experience only picks the first rung     |
| `profile.ts`       | `Profile` and its pure transitions (`applyAttempt`, `startSession`, `completeSessionItem`, ...) |
| `sessionRun.ts`    | A stored plan being played, in-session repeats, end-of-session summary                          |
| `recommend.ts`     | "What next": due reviews, then the next new skill, then when the next review arrives            |
| `personalBest.ts`  | Per-exercise bests for time, efficiency, performance and reaction                               |
| `giveUpAttempt`    | Ends an unsolved attempt as an honest failure (evaluation)                                      |
| `describeFeedback` | perfect / completed / failed, what the learner typed, and a better option (evaluation)          |

### Calibration vs placement vs evidence

Three different things, deliberately kept apart:

- **Experience** (self-report) only chooses which rung is probed first. It never grants anything.
- **Calibration** is a staircase: up after a pass, down after a failure, stop when a pass sits
  directly under a failure. A clear case takes two or three probes. A probe counts as passed only
  when solved **without hints**, because placing someone too high skips content they need.
- **Placement** (`LearnerState.placed`) is the outcome: the skills the learner was placed past
  count as satisfied prerequisites, so what builds on them unlocks. A placed skill carries **no
  evidence and no mastery**; it is still `learning` until practiced, and the session builder offers
  new skills before placed ones ("quick check" after).

The probe attempts themselves are ordinary attempts (`recordAttempt`), applied to the profile in a
single update when the check ends, so reloading halfway neither double-counts nor leaves a
half-estimate.

### Session run

The day's plan is built once and stored in the profile, so the list does not shift as state
changes and a reload resumes exactly where the learner stopped. A skill the scheduler asks to see
again (a lapse returns after 4 exercises, a shaky pass after 12) is queued in the run and put at
the front when its turn comes, capped by `session.maxInSessionRepeats`. A session left over from an
earlier day is closed as `abandoned` (and leaves no trace if nothing was attempted).

## Profile format (`PROFILE_VERSION = 1`)

Plain JSON: `userId`, `createdAt`, `settings.keyboardLayout`, `onboarding` (experience,
calibration result), `learner` (per-skill evidence, review state, `placed`), `history` (last 1000
attempts), `personalBests`, `activeSession`, `sessions` (last 60 summaries). Caps are
configuration (`profile.maxHistory`, `profile.maxSessionSummaries`).

`apps/web/src/storage/profileSchema.ts` validates it with Zod (`satisfies z.ZodType<Profile>` keeps
it in step with the domain type). `loadProfile` handles every bad case without losing data:

| Stored data                                              | Result                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| nothing                                                  | `empty`: a fresh profile is created                                         |
| valid                                                    | `loaded`                                                                    |
| broken JSON / wrong shape / unknown (e.g. newer) version | `unreadable`: moved to `tutor-nvim:profile:unreadable`, the learner is told |
| browser refuses writes (quota/private mode)              | the app keeps working and shows a banner that progress is not saved         |

Migrations are explicit: `migrateProfile` is the single place a future version bump adds a step.
When `localStorage` itself is blocked, `browserStorage()` falls back to in-memory storage.

## Web layer

- **Routing**: hash routes (`#/`, `#/session`, `#/map`, `#/skill/<slug>`, `#/progress`,
  `#/onboarding`). `?exercise=<slug>` still opens free practice (no profile, no scheduling) and
  wins over the hash, so existing links and the practice E2E keep working.
- **Clock**: `Clock` is injected through `ProfileProvider`; domain code never reads time. E2E moves
  time with Playwright's `page.clock`.
- **`PracticeScreen`** is the one practice loop for free practice, calibration probes and session
  items. The caller decides what happens at the end (`onFinish`, `renderResult`, `giveUpLabel`).
  `onFinish` is guarded so React's double-invoked dev effects cannot record one attempt twice.
- **Session screen** keeps the finished exercise on screen while its feedback is read, although
  the profile (already saved) has moved on to the next item.
- **Layout detection**: during onboarding the learner types `"`; `key` plus `code` identify the
  layout (`Quote` → US ANSI, `Digit2` → ES ISO). Anything else is inconclusive, never a guess; a
  radio group is always available. Pure function in `input/layout.ts`.
- **Skill map**: `layoutSkillGraph` places each skill from its prerequisites (column = longest
  prerequisite chain), so nothing about progression is in the UI. Each node is a link and states its
  stage in **words and an icon** (dashed border for locked); color is never the only signal.
- **Skill detail** shows mastery, accuracy, strategy, fluency, retention, transfer, attempts, next
  review and exactly what blocks mastery (`masteryBlockers`).

## Tests

- Unit: calibration, placement, session run, profile, personal bests, recommendation, feedback,
  give-up, graph layout, progress summary, router, layout detection, formatting.
- Integration (`tests/profile-flow.test.ts`): onboard → calibrate → play a whole session over the
  real content → serialize → return two days later → stored reviews lead the session; plus storage
  round-trip and every bad-storage case.
- E2E (`tests/e2e/product.spec.ts`): the full cycle in a browser, with time moved two days between
  visits; resume after reload; skipping calibration; ES ISO detection; unreadable profile; keyboard
  and non-color accessibility of the skill map.

## Decisions and findings

- **Placement is not mastery.** Self-report and calibration can only unlock; they cannot raise
  mastery or stage beyond `learning` (AGENTS 15).
- **Content was too thin for a first session.** Root skills had one exercise each, so a brand-new
  learner (stage `practicing` needs 2 attempts before dependents unlock) finished day one after a
  single exercise. M5 adds `vim.mode-normal.basic-002` and `vim.navigation-atomic.basic-002`.
  This is a stopgap: M7 must give each root skill several exercises and every skill at least two
  contexts.
- **A failed probe on a locked skill is still evidence** for that skill (it is just an attempt);
  it does not unlock it.
- The root `tsconfig.json` gained the `DOM` lib because E2E specs reference browser globals inside
  `page.evaluate`.

## Known limitations

- XP, combo, streak and daily goals are M8; the home screen shows no streak.
- Reloading in the middle of onboarding restarts the flow at the welcome step (layout and
  experience are kept as defaults; calibration probes are not saved until the check ends).
- Free practice is not recorded, by design.
- One profile per browser; no export/import yet (M6 adds sync).
- Warm-up difficulty and calibration thresholds are first values, not tuned with real learners.
