# IMPLEMENTATION_PLAN.md — Tutor NeoVim

## Status

Implementation plan derived from Tutor NeoVim PRD v1.0.

This plan is intentionally ordered by **technical risk**, not by visual product completeness.

The first objective is to prove that the practice engine can simulate the required Vim subset, record user behavior, and evaluate an exercise reliably.

---

# 1. Delivery strategy

Use incremental vertical slices.

Do not build all backend infrastructure first.

Do not build the complete UI first.

The preferred progression is:

```text
domain model
↓
Vim engine
↓
one executable exercise
↓
evaluation
↓
telemetry
↓
minimal practice UI
↓
learning model
↓
persistence
↓
full MVP UX
```

Each milestone must leave the repository in a working state.

---

# 2. Milestones

| Milestone | Goal | Exit condition |
|---|---|---|
| M0 | Repository foundation | monorepo, tooling, CI, schemas compile |
| M1 | Vertical practice slice | one `ci"` challenge works end-to-end |
| M2 | Vim core | MVP Vim command subset is stable and tested |
| M3 | Exercise platform | declarative content + validation + evaluation |
| M4 | Pedagogy engine | mastery, reviews, unlocks, daily builder |
| M5 | Local product MVP | onboarding → daily session → progress locally |
| M6 | Cloud persistence | auth + Neon + persisted attempts/progress |
| M7 | MVP content | ~20 skills, >=100 exercise templates |
| M8 | Gamification/polish | XP, combo, streak, PB, ghost baseline |
| M9 | MVP release hardening | accessibility, telemetry, E2E, perf, deployment |

Linux real, Neovim server sandboxes, and LazyVim begin only after M9.

---

# 3. M0 — Repository foundation

## Goal

Create a clean monorepo where domain packages can be developed independently from UI.

## Tickets

### T-001 — Initialize monorepo

Create:

```text
apps/web
apps/api
packages/vim-engine
packages/evaluation
packages/pedagogy
packages/exercise-schema
packages/shared
packages/ui
content/skills
content/exercises
content/environments
docs/architecture
```

Use:

```text
pnpm workspaces
TypeScript strict
ESLint
Prettier or equivalent formatting
Vitest
```

#### Acceptance criteria

- `pnpm install` works.
- `pnpm typecheck` works.
- `pnpm test` works even if initial suites are minimal.
- workspace package imports resolve correctly.

#### Depends on

None.

---

### T-002 — Configure web shell

Create React + Vite + TypeScript application.

Add Tailwind.

Render a minimal placeholder route.

#### Acceptance criteria

- app launches locally;
- production build succeeds;
- no domain logic exists in React yet.

#### Depends on

T-001.

---

### T-003 — Configure API shell

Create minimal Fastify TypeScript app.

Add:

```text
GET /health
```

No database required yet.

#### Acceptance criteria

- local API starts;
- `/health` returns healthy response;
- package has independent tests/build.

#### Depends on

T-001.

---

### T-004 — CI baseline

Create CI jobs for:

```text
install
lint
typecheck
test
build
```

#### Acceptance criteria

All jobs pass on clean repository.

#### Depends on

T-001, T-002, T-003.

---

### T-005 — Copy canonical documentation

Place:

```text
docs/PRD.md
AGENTS.md
IMPLEMENTATION_PLAN.md
```

in repository.

#### Acceptance criteria

Repository contains current source-of-truth docs.

---

# 4. M1 — Vertical practice slice

## Goal

Prove the hardest interaction loop before building infrastructure around it.

Canonical challenge:

```js
const mode = "development";
```

Target:

```js
const mode = "production";
```

Optimal action:

```text
ci"production<Esc>
```

---

### T-101 — Define core editor types

Implement minimal domain types:

```text
Position
TextBuffer
VimMode
VimState
KeyInput
```

Implement buffer helpers for:

```text
read line
replace range
insert
delete
cursor normalization
```

#### Acceptance criteria

- no React dependency;
- immutable or controlled state transitions;
- unit tests cover multiline buffer behavior.

---

### T-102 — Implement NORMAL/INSERT state transitions

Support:

```text
i
Esc
```

Enough to enter and exit insert mode.

#### Acceptance criteria

- `i` enters INSERT at cursor;
- characters type into buffer;
- `Esc` returns NORMAL;
- tests cover transition and cursor result.

#### Depends on

T-101.

---

### T-103 — Implement `ci"` minimal path

Implement only what is required for canonical exercise:

```text
c
i
"
```

Recognize enclosing quote text object and enter INSERT after deleting inner contents.

#### Acceptance criteria

For:

```js
const mode = "development";
```

with cursor anywhere inside `development`:

```text
ci"
```

results in:

```js
const mode = "";
```

and INSERT mode at the correct location.

#### Depends on

T-101, T-102.

---

### T-104 — Implement exercise schema v1

Create Zod schema for minimal executable exercise:

```text
id
slug
skillIds
mode
difficulty
initialState
objective
solutions
hints
```

Add schema version.

#### Acceptance criteria

- valid canonical YAML parses;
- invalid exercise produces useful validation errors;
- duplicate identity validation can be added at collection level.

---

### T-105 — Add canonical exercise content

Create:

```text
content/exercises/vim-ci-quotes-001.yaml
```

Represent canonical challenge.

#### Acceptance criteria

`pnpm content:validate` parses it successfully.

#### Depends on

T-104.

---

### T-106 — Implement key telemetry

Create framework-independent attempt recorder.

Record:

```text
timestamp
key
code
mode
cursorBefore
cursorAfter
accepted
```

#### Acceptance criteria

Canonical attempt produces ordered events sufficient for replay.

---

### T-107 — Implement minimal objective evaluator

Support:

```text
buffer_equals
requireFinalNormalMode
```

#### Acceptance criteria

Canonical final state passes only when:

- buffer matches target;
- final mode satisfies exercise requirement.

---

### T-108 — Implement basic strategy matching

Canonical known solution:

```text
ci"production<Esc>
```

Classification:

```text
optimal
```

Allow success to remain distinct from strategy.

#### Acceptance criteria

Evaluator can return:

```ts
{
  success: true,
  strategy: "optimal"
}
```

---

### T-109 — Calculate initial attempt metrics

Implement:

```text
firstInputLatencyMs
totalDurationMs
keystrokes
success
basic efficiency score
basic strategy score
```

Use configuration for weights.

#### Acceptance criteria

Tests use fixed timestamps and deterministic expected values.

---

### T-110 — Minimal PracticeScreen

Build one low-distraction practice route.

Show:

```text
instruction
buffer/editor
NORMAL/INSERT status
result
```

Keyboard events are adapted to `KeyInput` and passed to engine.

#### Acceptance criteria

A user can complete canonical challenge in browser.

No network required.

---

### T-111 — End-to-end vertical slice test

Playwright test should:

1. open challenge;
2. type `ci"production`;
3. press Escape;
4. verify target buffer;
5. verify success result;
6. verify optimal classification.

#### Exit criteria for M1

M1 is complete only when T-111 passes.

No auth/database/gamification work before this point.

---

# 5. M2 — Vim core

## Goal

Expand the engine from proof-of-concept to the MVP command subset.

Organize implementation by behavior families.

---

## Sprint 2A — Core motion

### T-201 — `h j k l`

Requirements:

- bounds-safe;
- multiline;
- predictable cursor column behavior.

### T-202 — `0 ^ $`

Requirements:

- first column;
- first non-blank;
- line end.

### T-203 — `w W b B e E`

Requirements:

- define word/WORD semantics explicitly;
- fixtures cover punctuation and whitespace.

### T-204 — `f<char>`, `t<char>`, `;`, `,`

Requirements:

- repeat previous char search;
- forward/backward semantics;
- failure leaves cursor stable.

#### Sprint exit

All motions have exhaustive fixture-style tests.

---

## Sprint 2B — Insert transitions

### T-211 — `a`

### T-212 — `o`

### T-213 — Insert text edge cases

Cover:

```text
empty buffer
empty line
line end
multiline insertion
Esc behavior
```

---

## Sprint 2C — Operators

### T-221 — operator state machine

Support pending:

```text
d
c
y
```

Do not implement operators as independent ad-hoc shortcuts.

### T-222 — `dd`

### T-223 — `yy`

### T-224 — `cw`

### T-225 — operator + motion composition groundwork

Required so later combinations can share grammar.

---

## Sprint 2D — Text objects

### T-231 — `iw`

### T-232 — `i"` and `a"`

### T-233 — `i(` and `a(`

### T-234 — `i{` and `a{`

Add tests combining:

```text
c
d
y
```

where supported.

---

## Sprint 2E — Editing state

### T-241 — `x`

### T-242 — `p` and `P`

Define minimal unnamed register behavior required by MVP.

### T-243 — `u`

### T-244 — `Ctrl+r`

### T-245 — `.` repeat

Repeat must replay last repeatable **change**, not arbitrary navigation.

#### M2 exit criteria

The complete MVP command subset listed in AGENTS.md is supported and unit tested.

---

# 6. M3 — Exercise platform

## Goal

Turn the engine into a scalable learning content system.

---

### T-301 — Full Exercise schema v1

Add:

```text
environment
evaluation
antiPatterns
metadata
transfer tags
estimated seconds
language/context
```

---

### T-302 — Skill schema v1

Fields:

```text
id
slug
title
description
domain
tier
prerequisites
concepts
tags
difficulty
enabled
```

---

### T-303 — Content loader

Load:

```text
content/skills/**/*.yaml
content/exercises/**/*.yaml
```

Normalize validated records.

---

### T-304 — Content CLI

Implement:

```text
pnpm content:validate
pnpm content:test
```

---

### T-305 — Exercise solution runner

For every declared solution:

```text
initial state
→ execute sequence
→ evaluate target
```

CI fails on invalid known solution.

---

### T-306 — Goal evaluator expansion

Support at least:

```text
buffer_equals
cursor_at
mode_equals
compound/all
```

Only add goal types required by current content.

---

### T-307 — Strategy classifier

Support:

```text
optimal
efficient
valid
inefficient
anti-pattern
failed
```

Strategy classification should be extensible through rules.

---

### T-308 — Anti-pattern: repeated_x

Detect excessive repeated delete-character behavior.

---

### T-309 — Anti-pattern: excessive_hjkl

Use configurable threshold relative to task context.

---

### T-310 — Anti-pattern: arrow_keys

Browser adapter must preserve arrow input even when simulator chooses not to execute it.

---

### T-311 — Anti-pattern: insert_mode_navigation

Detect when movement is performed in INSERT using prohibited pattern where applicable.

---

### T-312 — Metrics v1

Implement full MVP metrics:

```text
accuracy
strategy
efficiency
fluency
first input latency
duration
errors
hints
performance
```

---

### T-313 — Hints engine

Support progressive timed hints.

Hints affect metrics/mastery evidence.

#### M3 exit criteria

At least 10 declarative exercises covering multiple skills can be loaded, executed, tested, and evaluated without adding exercise-specific React code.

---

# 7. M4 — Pedagogy engine

## Goal

Determine what a user should practice, when, and how progression changes.

---

### T-401 — UserSkill domain model

Implement:

```text
stage
mastery
accuracy
strategy
fluency
retention
transfer
attemptCount
lastAttemptAt
nextReviewAt
```

---

### T-402 — Mastery calculation v1

Initial configurable weighting:

```text
accuracy 30%
strategy 20%
fluency 20%
retention 20%
transfer 10%
```

Tests must confirm repetition of one exercise cannot alone reach final mastery.

---

### T-403 — Mastery stage transitions

Support:

```text
locked
learning
practicing
fluent
mastered
```

---

### T-404 — Prerequisite unlock engine

A skill becomes available only when configured prerequisites satisfy threshold.

---

### T-405 — ReviewState

Implement:

```text
stability
difficulty
dueAt
lastPerformance
streak
```

---

### T-406 — Review scheduler v1

Initial interval family:

```text
within session
after several exercises
1 day
3 days
7 days
14 days
30 days
```

Adjust based on performance.

Use injected clock for tests.

---

### T-407 — Exercise priority function

Inputs:

```text
due
weakness
prerequisite need
diversity
transfer need
recent repetition
```

Return deterministic score.

---

### T-408 — Daily session builder

Build:

```text
warmup
reviews
learn
mixed
challenge
```

Seeded/deterministic.

---

### T-409 — Transfer evidence

Mark exercises as transfer evidence based on context variation.

Update `UserSkill.transfer`.

---

### T-410 — Delayed recall evidence

Scheduler/result integration must distinguish delayed recall from same-session repetition.

#### M4 exit criteria

Given a synthetic user history, tests can demonstrate:

- weak skills return sooner;
- strong skills return later;
- prerequisites gate new skills;
- daily session mixes categories;
- mastery requires retention/transfer.

---

# 8. M5 — Local product MVP

## Goal

Allow a user to experience the complete product locally before cloud infrastructure.

Use local persistence first.

---

## Sprint 5A — Onboarding

### T-501 — Welcome flow

### T-502 — Keyboard layout selection

Initial:

```text
US ANSI
ES ISO
```

### T-503 — Experience self-report

Options:

```text
Never used Vim
Know basics
Use Vim occasionally
Use Vim regularly
```

Must influence calibration selection only.

### T-504 — Calibration engine

Short adaptive check around:

```text
hjkl
mode switch
word movement
operator
```

---

## Sprint 5B — Daily flow

### T-511 — Local profile store

Use IndexedDB/local storage abstraction.

### T-512 — Daily home

Primary CTA:

```text
Continue Training
```

### T-513 — Session runner

Runs the session produced by pedagogy package.

### T-514 — Exercise feedback UI

Support:

```text
perfect
completed/suboptimal
failed
hint
```

### T-515 — End-of-session summary

Show concise:

```text
skills trained
reviews completed
personal bests
next recommendation
```

---

## Sprint 5C — Progress

### T-521 — Skill Map

Data-driven skill graph.

States:

```text
locked
learning
practicing
fluent
mastered
```

### T-522 — Skill detail

Show:

```text
mastery
accuracy
fluency
retention
transfer
next review
```

### T-523 — Progress summary

Minimal useful dashboard only.

#### M5 exit criteria

A user can:

```text
onboard
calibrate
complete daily session
progress skills
close app
return
receive stored reviews
```

without cloud account.

---

# 9. M6 — Cloud persistence

## Goal

Persist progress securely across devices.

---

### T-601 — Neon database setup

Create migrations for:

```text
users
user_settings
skills
skill_prerequisites
exercises
exercise_skills
user_skills
attempts
attempt_events
sessions
session_exercises
review_queue
```

---

### T-602 — Select and integrate auth

Acceptable implementation choice:

```text
Clerk
or
Supabase Auth
```

Decision should be recorded in ADR.

---

### T-603 — User API

Implement:

```text
GET /api/me
```

---

### T-604 — Skills API

```text
GET /api/skills
GET /api/skills/:id
```

---

### T-605 — Sessions API

```text
GET /api/session/daily
POST /api/sessions
```

---

### T-606 — Attempts API

```text
POST /api/attempts
POST /api/attempts/:id/complete
```

Events may be sent on complete in MVP.

---

### T-607 — Progress API

```text
GET /api/progress
```

---

### T-608 — Local/cloud synchronization

Define conflict behavior.

Prefer server authoritative for persisted mastery.

Practice must still not block on per-key network.

#### M6 exit criteria

Progress follows authenticated user across browser sessions/devices.

---

# 10. M7 — MVP content production

## Goal

Reach useful curriculum coverage.

Target:

```text
~20 skills
>=100 exercise templates
>=5 meaningful variants for high-priority patterns
```

---

## Content group A — Modes and atomic movement

Create exercises for:

```text
NORMAL
INSERT
hjkl
```

---

## Content group B — Semantic movement

Create exercises for:

```text
w
b
e
0
^
$
f
t
;
,
```

---

## Content group C — Operators

Create exercises for:

```text
d
c
y
dd
yy
cw
```

---

## Content group D — Text objects

Create exercises around:

```text
ciw
diw
ci"
di"
ci(
da(
```

with contexts:

```text
JavaScript
TypeScript
Python
Lua
JSON
shell/config
```

---

## Content group E — Repeat/undo

Create exercises for:

```text
u
Ctrl+r
.
```

---

## Content quality requirements

Every important skill should have examples across stages:

```text
discover
imitate
recall
discriminate
transfer
```

Not every content item needs all five, but curriculum coverage must.

---

# 11. M8 — Gamification and feedback

## Goal

Increase motivation without corrupting learning signals.

---

### T-801 — XP service

XP must not affect mastery.

---

### T-802 — Combo

Increase on high-quality consecutive attempts.

Reset on configured conditions.

---

### T-803 — Daily streak

Motivational, non-punitive.

---

### T-804 — Personal best

Store:

```text
time
efficiency
performance
reaction
```

---

### T-805 — Ghost data comparison

Initial version may be static textual/step comparison.

No need for complex animation first.

Example:

```text
YOU      hhhhwwci"
MASTER   2wci"
```

---

### T-806 — Basic replay

Use stored attempt events to replay cursor/input sequence.

---

# 12. M9 — Release hardening

## Goal

Turn working MVP into releasable product.

---

### T-901 — Accessibility audit

Verify:

```text
keyboard only
focus
contrast
reduced motion
non-color state indicators
sound toggle
```

---

### T-902 — Performance audit

Measure:

```text
keypress latency
render cost
exercise transition
initial load
```

---

### T-903 — Analytics instrumentation

Events:

```text
session_started
session_completed
exercise_started
exercise_completed
exercise_failed
hint_used
skill_unlocked
skill_mastered
review_completed
personal_best
daily_streak
```

---

### T-904 — E2E suite

Required journeys:

```text
new user onboarding
calibration
daily session
skill unlock
returning review
```

---

### T-905 — Production deployment

Deploy frontend, API, DB.

Document environment configuration.

---

### T-906 — Error monitoring

Add frontend/backend error observability.

Provider choice is implementation detail.

---

### T-907 — Content integrity CI

Production deploy must be blocked if:

```text
schema invalid
solution test fails
dangling prerequisite
duplicate slug
```

---

# 13. Post-MVP roadmap

Do not begin until MVP is stable.

## P1 — Linux simulator

Support:

```text
pwd
ls
cd
mkdir
touch
cp
mv
rm
cat
less
grep
find
chmod
pipes
redirection
```

Use same skill/mastery framework.

---

## P2 — Linux + Vim missions

Simulated file tree + Vim practice.

Example:

```text
find configuration
open file
edit value
save
```

---

## P3 — Real sandbox architecture

Add:

```text
xterm.js
WebSocket
sandbox gateway
ephemeral Linux container
```

Security review required before public execution.

---

## P4 — Real Neovim telemetry

Run Neovim with RPC endpoint and Tutor Agent.

Observe:

```text
mode
cursor
buffer
files
windows
```

---

## P5 — LazyVim profiles

Version environments.

Examples:

```text
lazyvim-2027.xx
lazyvim-typescript-2027.xx
lazyvim-python-2027.xx
```

Never bind content to “latest”.

---

# 14. Recommended first implementation sprint

The first agent assignment should contain only:

```text
T-001
T-002
T-101
T-102
T-103
T-104
T-105
T-106
T-107
T-108
T-109
T-110
T-111
```

It may skip T-003 API until after M1 because M1 does not require a backend.

Preferred sequence:

```text
repo
↓
domain types
↓
minimal Vim behavior
↓
exercise schema/content
↓
telemetry/evaluation
↓
PracticeScreen
↓
E2E
```

---

# 15. Agent stop conditions

An implementation agent should stop and surface the issue rather than guessing if:

- the requested Vim behavior is ambiguous enough to change user-facing semantics;
- a package boundary must be violated;
- a new dependency materially changes architecture;
- a ticket appears to require post-MVP infrastructure;
- schema changes break released content identifiers;
- a design choice would make deterministic testing impossible.

Small implementation choices should be resolved autonomously.

---

# 16. Ticket completion template

For each completed ticket, report:

```md
## T-XXX — Title

### Implemented
- ...

### Tests
- ...

### Verification
- pnpm typecheck
- pnpm test ...

### Files
- ...

### Notes / debt
- none
```

---

# 17. First product demo target

The first demo should be deliberately unimpressive visually.

It needs only to prove:

```text
instruction
+
editable buffer
+
real Vim-like key handling
+
telemetry
+
deterministic result
```

Canonical demo:

```text
Challenge:
Change only the text inside quotes.

const mode = "development";
```

User executes:

```text
ci"production<Esc>
```

Result:

```text
SUCCESS
Strategy: optimal
Keystrokes: ...
First reaction: ...
Duration: ...
```

If this demo is reliable, continue.

If it is not reliable, do not hide the problem behind UI polish.

---

# 18. MVP success gate

Do not declare MVP complete until:

- all required Vim commands are tested;
- >=100 exercise templates validate;
- known solutions execute successfully in CI;
- daily session generation is deterministic;
- mastery cannot be farmed by immediate repetition;
- delayed review works;
- transfer evidence works;
- ES ISO and US ANSI input paths are tested;
- core journeys pass E2E;
- practice remains low latency.
