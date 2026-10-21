# M4 — Pedagogy engine: architecture notes

Status: implemented in `packages/pedagogy`. Everything is pure and deterministic: no React, no
network, no `Date.now()`. "Now" is always an argument (the injected clock), and randomness is a
seeded generator, so a synthetic user history always produces the same schedule and sessions.

```text
Exercise + AttemptEvaluation.metrics + clock
        │
        ▼
 recordAttempt ──► UserSkill evidence (accuracy, strategy, fluency, retention, transfer)
        │            ├─ mastery (weighted, confidence-scaled)
        │            ├─ ReviewState via scheduleReview (stability, difficulty, dueAt, streak)
        │            └─ stages re-resolved over the whole skill graph (unlock engine)
        ▼
 LearnerState ──► scoreExercise (priority) ──► buildDailySession (warmup/reviews/learn/mixed/challenge)
```

`pedagogy` depends only on `exercise-schema` (for `Skill`/`Exercise` types). It reads attempts
through a structural `AttemptOutcome`, so `evaluateAttempt(...).metrics` plugs in directly without
the package importing `evaluation`.

## Data model (T-401, T-405)

`UserSkill` is keyed by skill slug (like `Exercise.skillIds`) and carries `stage`, `mastery`, the
five dimensions (0–100), `attemptCount`, `lastAttemptAt`, `nextReviewAt`, plus `review`
(`ReviewState`: `stability` in days, `difficulty` 0–1, `dueAt`, `lastPerformance`, `streak`) and the
counters the mastered gate needs (`delayedRecallCount`, `transferCount`, `seenContexts`). Times are
epoch milliseconds so state is plain JSON.

## Mastery (T-402, T-403)

Each attempt moves `accuracy`, `strategy` and `fluency` as an exponential moving average
(`mastery.learningRate`). Hints shrink the accuracy evidence of an attempt
(`hintEvidencePenalty`), so hints reach mastery as well as the performance score.
`retention` and `transfer` move **only** with their own kind of evidence (below).

```text
mastery = (0.30 accuracy + 0.20 strategy + 0.20 fluency + 0.20 retention + 0.10 transfer)
          × min(1, attempts / attemptsForFullConfidence)
```

Without retention and transfer the ceiling is 70, under the mastered threshold of 85, so one
exercise repeated a thousand times can reach `fluent` and no further.

Stages are _derived_ from evidence (`deriveStage`), not stored verdicts:

| Stage        | Rule (all configurable)                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locked`     | prerequisites not satisfied                                                                                                                                       |
| `learning`   | unlocked                                                                                                                                                          |
| `practicing` | ≥ 2 attempts and accuracy ≥ 50                                                                                                                                    |
| `fluent`     | mastery ≥ 60, accuracy ≥ 80, fluency ≥ 60                                                                                                                         |
| `mastered`   | PRD 29: mastery ≥ 85, accuracy ≥ 95, strategy ≥ 85, transfer ≥ 75, retention ≥ 80, **and** ≥ 1 successful delayed recall **and** ≥ 1 successful transfer exercise |

Because the stage is derived, a learner who starts failing falls back from `mastered`; there is
no hysteresis yet. `masteryBlockers` lists exactly which criteria are missing, for the UI.

## Unlock engine (T-404)

`resolveStages` resolves the graph recursively with memoization: a skill unlocks when every
prerequisite reached `unlock.minPrerequisiteStage` (default `practicing`). Finishing a prerequisite
therefore unlocks dependents with no attempt of their own; `refreshStages` creates their
`learning` entries. Disabled skills are outside the graph (locked, and ignored as prerequisites);
a cycle leaves its members locked instead of looping (the content loader already rejects cycles).

An attempt on a still-locked skill is recorded as evidence but does not unlock anything by
itself: the stage stays `locked` until the prerequisites hold.

## Delayed recall vs same-session repetition (T-410)

An attempt is **delayed recall** when at least `delayedRecallMinMs` (12 h) passed since the
previous attempt at that skill. Only delayed recall moves `retention` (a failed one pulls it down)
and only a _successful_ one counts toward `delayedRecallCount`. Immediate repetition changes
accuracy/strategy/fluency and nothing else.

Separately, the attempt is the **scheduled review** when it is also due (`dueAt` minus a 4 h
tolerance has arrived). Only a scheduled review can advance the interval ladder.

## Transfer evidence (T-409)

Transfer is variation of the _context key_ `language/context` (from exercise `metadata`):

- the first context the learner solves a skill in is its "home" and is never transfer;
- an attempt in a context the learner has not yet solved the skill in is transfer evidence, and
  moves `transfer` (a failure there lowers it but leaves the context open for a retry);
- repeating a context never counts twice, so re-doing the same transfer exercise cannot farm it.

`transferTags` stay authoring metadata. The session builder uses the same context test to choose
challenge material.

## Review scheduler v1 (T-406)

Not SM-2. `scheduleReview(previous, attempt, config)` returns the new `ReviewState`, whether the
attempt was the scheduled review, whether it was a lapse, and `inSessionAfter`.

- **Lapse** (failure or performance < 60): streak 0, stability × 0.5, due again in 10 minutes
  and again after 4 exercises in the session.
- **Pass**: the interval is `ladder[streak] × factor(performance) × (1.2 − 0.4 × difficulty)`
  with the ladder 1, 3, 7, 14, 30 days; `factor` runs from 0.6 at the pass mark to 1.4 at 100.
  Growth is capped at 3× the previous stability, so recovery after a lapse cannot jump far.
- Hints on a pass keep the streak and use the minimum factor. Latency, strategy and efficiency are
  already inside the performance score, so slower or sloppier attempts shorten the interval.
- Practicing again in the same session, or early, leaves the due date and streak alone.
- A first success (or a shaky pass) asks to reappear after 12 exercises. `enqueueInSession` /
  `takeDueInSession` implement that in-session queue as pure functions on a plain array.

Example with perfect on-time reviews: 1.5, 4.5, 11, 23, 49 days. At performance 65 the same
ladder gives 0.7, 2, 5, 10, 22 days.

`retrievability(skill, now)` = `exp(−elapsedDays / stability)` feeds the weakness term.

## Exercise priority (T-407)

`scoreExercise` returns each component (0–1) and the weighted total:

```text
priority = 3.0 reviewDue + 2.0 weakness + 1.5 prerequisiteNeed
         + 1.0 diversity + 1.5 transferNeed − 2.5 recentRepetition
```

- `reviewDue`: 0 if not due, 0.5–1 when due (more when overdue relative to stability);
- `weakness`: `max(1 − mastery, 1 − retrievability)`, 0.5 for a never-attempted skill;
- `prerequisiteNeed`: share of locked dependents the skill still blocks;
- `diversity`: 1 − 0.5^(distance − 1) to the latest pick of the same skill in the session;
- `transferNeed`: `1 − transfer` for a practiced skill and a context it has not solved;
- `recentRepetition`: the exercise itself, by position in the session and by hours since the last
  attempt (12 h half-life).

No randomness here; ties break by exercise id. A multi-skill exercise takes its best skill's score.
An exercise is only offered when **all** its skills are unlocked.

## Daily session builder (T-408)

`buildDailySession({ userId, date, seed?, now, skills, exercises, learner, history })`. The only
randomness is a small seeded jitter (`hash(userId|date|seed)`), so the same inputs give the same
session and a different `seed` gives another reproducible one.

| Block       | Source                                                                                 |
| ----------- | -------------------------------------------------------------------------------------- |
| `warmup`    | `fluent`/`mastered` skills that are not due, easiest and most varied first             |
| `reviews`   | skills whose review is due, by priority (weakest first); one exercise per skill first  |
| `learn`     | skills in `learning` (earliest tier first), easiest exercise first, recently seen last |
| `mixed`     | interleaved practice of attempted skills, by priority                                  |
| `challenge` | exercises that would be transfer evidence; if none, the hardest ones                   |

Exercises that would be transfer evidence are reserved for `challenge` so reviews and mixed
practice do not use them up. Quotas that warm-up or reviews cannot fill (nothing fluent, nothing
due) flow into `mixed` instead of being invented. A skill never repeats more than
`maxSameSkillRun` (2) times in a row outside `learn` while an alternative exists. Items carry
`exerciseId`, `skillId`, `block` and a human-readable `reason`.

## Content findings

- **A skill whose only exercise also trains a locked skill dead-ends a new learner.** The M3
  `vim.mode.normal` had no standalone exercise, so a brand-new learner got an empty session. M4
  adds `vim-mode-normal-001` and `tests/pedagogy-flow.test.ts` now fails if any skill lacks an
  exercise that uses only itself and its ancestors.
- **A skill can only be mastered if it has exercises in more than one context.** _(Closed in M7: every skill now has ≥ 3 contexts and a transfer exercise.)_ Today only
  `vim.operator.change` and `vim.textobject.inner-quotes` do; the rest top out at `fluent` with
  mastery 90. M7 content must give every skill at least two contexts.

## Known limitations

- Performance is the scheduler's single quality signal; PRD 30 also lists raw latency as its own
  input. It is folded in through the fluency part of the performance score.
- No stage hysteresis: one bad review can lower a dependent's availability the moment a
  prerequisite drops below `practicing`.
- The learner's per-exercise history is passed in (`AttemptRecord[]`); persisting it belongs to M6.
- Warm-up difficulty is the exercise's declared `difficulty`, not a per-learner estimate.
