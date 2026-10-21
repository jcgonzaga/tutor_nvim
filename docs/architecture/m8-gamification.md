# M8 — Gamification and feedback: architecture notes

Status: implemented and tested. The goal of the milestone is to _increase motivation without
corrupting learning signals_ (IMPLEMENTATION_PLAN section 11). Everything here is pure domain logic
in `packages/pedagogy/src/gamification/` and `packages/evaluation/src/replay.ts`; the web app only
renders it.

```text
                      ┌────────── learning (unchanged since M4) ──────────┐
 finished attempt ──► │ applyAttempt: mastery, review schedule, history   │──► LearnerState
        │             └───────────────────────────────────────────────────┘
        │             ┌────────────── game layer (M8) ───────────────────┐
        └─ facts ───► │ combo ─► XP (decay, cap)  ·  streak  ·  records  │──► GamificationState
                      └──────────────────────────────────────────────────┘
        one way only: the game layer reads facts about the attempt; nothing reads it back
```

## The rule that shapes the design: XP is not mastery (AGENTS 2.7, 15)

- `finishAttempt` runs the learning path **first and unchanged** (`applyAttempt`), then the game
  layer. The game layer receives _facts_ (solved?, feedback kind, hints used, was it a scheduled
  review, was it transfer, personal bests, combo) and returns XP; it never receives a `UserSkill`,
  a mastery value or a stage, and it only writes `Profile.gamification` and the session's combo.
- Tests make that a guarantee, not a convention: the learner after any sequence of attempts is
  **identical** with and without the game layer (unit test and a 24-day walkthrough over the real
  curriculum), the XP inputs are asserted to be exactly the attempt facts, and grinding one
  exercise 100 times in a day yields 27 XP (15 + 8 + 4) and no mastery.
- The pedagogy engine (sessions, scheduler, priorities, unlocks) does not import anything from
  `gamification/`. The daily session is the same with or without XP.

## XP (T-801)

`awardAttemptXp(facts, config)`, all numbers in `GamificationConfig`:

| Source                                        | XP                                |
| --------------------------------------------- | --------------------------------- |
| Solving an exercise                           | 10 (a failed attempt earns **0**) |
| Perfect run (best strategy, no errors, hints) | +5                                |
| Scheduled review completed                    | +6                                |
| Transfer (a skill solved in a new context)    | +8                                |
| Personal best                                 | +3 per improved metric, at most 2 |
| Finishing the day's session (once per day)    | +20                               |

Modifiers: each hint costs 25 % of the completion XP; the combo adds +5 % per step above 1, up to
+25 %. **Anti-farming:** the 2nd success at the same exercise the same day pays 50 %, the 3rd 25 %,
the 4th nothing (personal bests are exempt: they need a real improvement), and attempt XP stops at
400 per day. Speed is never rewarded on its own: nothing is paid for a fast wrong answer, and the
only time-based XP is a personal-best time on a _solved_ exercise (AGENTS 2.6).

A level is just a name for a total: going from level L to L+1 needs `round(100 · L^1.3)` XP.

## Combo (T-802)

Session-scoped (it starts at 0 each session, so free practice has none). It **grows** on a solved
attempt with no strong hint, no anti-pattern and a strategy of valid or better; it **holds** on a
correct but inefficient solution; it **resets** on a failure, a hint of level ≥ 2, or an
anti-pattern (PRD 33). The reset is worded as "a fresh start". The combo depends on no time input, so
rushing cannot build one.

## Streak (T-803)

Counts days with a completed daily session (`SessionRewards`, paid once when the last exercise of
the session is finished). It is deliberately forgiving: **one missed day in a row is forgiven**
(`graceDays: 1`), a longer gap starts a new streak at 1 and the longest is never taken away.
A clock set back is ignored. The UI shows the streak and never a countdown or a warning; after a
gap it says "Welcome back. Your longest streak was N days; a new one starts with today's session."
(a test asserts the text contains none of lost/broke/miss/fail). Days are local calendar days
compared as `YYYY-MM-DD` strings, so daylight saving cannot skew them.

## Personal bests (T-804)

The four metrics (time, efficiency, performance, reaction) have been stored per exercise since M5.
M8 adds `recentBests` (the latest five, for "Recent personal best" on the home screen) and +XP for
improvements.

## Ghost comparison (T-805) and basic replay (T-806)

- The best run of each exercise (by performance) is stored compactly: the logical keys, the time of
  each, duration. `ghostComparison` puts **YOU**, **MASTER** (the shortest declared optimal solution)
  and **YOUR BEST** (when it is a different run) side by side:

  ```text
  YOU        f"lcT"production<Esc>     17 keys   4.0 s
  MASTER     ci"production<Esc>        14 keys
  ```

- `buildReplay(exercise, run)` feeds a run back through the engine and returns the editor after
  every key (frame 0 is the starting state, with the exercise's `setupKeys` applied). It is pure,
  so the learner's run, their best run and the master's replay with the same code. A key the engine
  rejected is shown as not accepted rather than hidden.
- The replay panel steps manually (Start / Back / Step), announces each step (`role="status"`), and
  offers **Play** only when the visitor has not asked for reduced motion.

## Profile v2 and migration

`PROFILE_VERSION` is now 2. Added: `Profile.gamification`, `ActiveSession.combo` and
`ActiveSession.rewards`, optional `xp` on completed items and session history. The web storage
migrates v1 → v2 explicitly (`migrateProfile`): nothing is back-dated, XP and streak start at zero,
a session already in play starts its combo at 0. Tests cover the migration, a damaged v1 profile
being refused, and a full round trip of the new fields. The Zod schemas live in `@tutor-nvim/shared`.

## Cloud (ADR-0003 section 9)

The game layer **follows the account**. It is not synced as numbers: the server recomputes it from
the uploaded attempts and sessions with the same pure functions (`computeAttemptReward` is the one
definition of what an attempt earns, called by `finishAttempt` on the device and by the API).

- Each attempt submission carries the learner's local day (`localDay`); XP decay, the daily cap and
  the streak are per local day, which the server cannot infer.
- Server side, `attempts` gained `local_day`, `xp`, `combo_after`, `improved` and `started_ms`,
  `sessions` gained `bonus_xp`, and `user_gamification` holds a legacy baseline (migration `0001`).
- Only attempts of a daily session earn XP and combo; the daily bonus is paid when a session is
  submitted finished and not abandoned, once per local day; the streak is replayed over completed
  days; best runs are the best solved attempt per exercise with its stored events.
- `GET /api/progress` returns `gamification`; the device replaces its own with it after syncing
  (best runs it earned before sync are kept where the server has none).
- Practice stays instant: the device computes the same reward immediately for the feedback.
- Progress earned before sync is adopted once, with its XP, best combo and streak as a baseline.

A found bug worth recording: the first time the server stored a review date the database column
(`bigint`) rejected a **fractional** epoch time, because the scheduler produced `dueAt` as
`at + days × 86 400 000` with float factors. It never showed in unit tests, which never stored the
state. The scheduler now rounds to whole milliseconds and a test pins it.

## Tests

- Unit (`packages/pedagogy/src/gamification`): XP (failure, hints, bonuses, repeat decay, cap,
  combo bonus, farming bound, levels), combo (every transition and reset reason), streak (grace,
  gaps, month/year/DST, clock set back, display), state (cap bookkeeping, pruning, best-run choice).
- Profile (`profileGamification.test.ts`): learner identical with/without XP; XP per attempt;
  combo in the session; rewards paid once per session and once per day; abandoned sessions pay
  nothing.
- Evaluation (`replay.test.ts`): replay frames, setup keys, rejected keys, determinism, comparison rows.
- Integration (`tests/gamification-flow.test.ts`): 24 days over the real curriculum, plain vs game
  learner identical, streak of 24, cap respected, every stored best run replays to the live state,
  every exercise's master run replays.
- Web: wording (streak never scolds), migration, rewards input.
- E2E (`tests/e2e/gamification.spec.ts`): a session with XP/combo/reset/summary/streak; ghost
  comparison and replay; play vs reduced motion; streak across days with `page.clock`; the skill
  page shows mastery and no XP.

## Known limitations

- Two devices that practice at once can disagree for a moment on the repeat decay; the server's number wins.
- XP values, the grace period and the level curve are first values, not tuned with real learners.
- No sound or animation for rewards (AGENTS 19: optional sounds, reduced motion); numbers and words only.
- The keyboard heatmap (PRD 35) and Rush mode are not part of M8 in the plan and were not built.
- The ghost shows keys and counts, not a side-by-side animation, as the plan allows for a first version.
