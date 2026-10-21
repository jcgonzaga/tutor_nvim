# AGENTS.md — Tutor NeoVim

## 1. Purpose

This repository implements **Tutor NeoVim**, a web-first gamified training application for Linux basics, Vim/Neovim, and later LazyVim.

The product is not a traditional course. Its core purpose is to train users to:

1. recognize the correct action for a situation;
2. execute it accurately and fluently;
3. retain it over time;
4. transfer it to different contexts.

The canonical product specification is:

```text
docs/PRD.md
```

If implementation details conflict with the PRD, the PRD wins unless an explicit architectural decision record supersedes it.

---

## 2. Core engineering principles

These rules are mandatory.

### 2.1 Skill-first architecture

The learning unit is a `Skill`, not a lesson or page.

Do not hardcode progression into UI routes.

Skill relationships, prerequisites, mastery, and unlock rules must be represented as data.

---

### 2.2 Exercises are content, not application code

Exercises must be declarative and loaded from validated content.

Do not create one React component per exercise.

Expected pipeline:

```text
YAML/JSON
   ↓
schema validation
   ↓
normalized Exercise
   ↓
practice engine
   ↓
evaluation
```

---

### 2.3 Vim logic must not live in React

The Vim simulator must be a framework-independent TypeScript package.

It must be possible to run:

```text
initial state
+ sequence of keys
= final editor state
```

without a browser and without React.

---

### 2.4 Pedagogy logic must not live in React

Mastery, review scheduling, skill unlocking, exercise selection, and session building must be pure/testable domain logic.

React only renders state and dispatches actions.

---

### 2.5 Deterministic evaluation

Do not use an LLM to determine whether an attempt is correct.

Exercise completion and strategy classification must be deterministic and testable.

AI may later assist with content generation or explanations, but never be the source of truth for correctness.

---

### 2.6 Accuracy before speed

Never reward fast incorrect behavior.

Product progression follows:

```text
accuracy → fluency → speed
```

Rush/timed mechanics may only apply after sufficient correctness.

---

### 2.7 XP is not Mastery

XP measures participation/gamification.

Mastery measures estimated competence.

They must never share a calculation or be used interchangeably.

A user cannot achieve mastery by farming XP.

---

### 2.8 Multiple valid Vim strategies

Never assume that a single keystroke sequence is the only valid answer.

Evaluation must support classifications:

```text
optimal
efficient
valid
inefficient
anti-pattern
failed
```

Final state correctness is distinct from strategy quality.

---

### 2.9 Keyboard layout awareness

Do not assume US ANSI.

From the beginning, capture and preserve both:

```text
KeyboardEvent.key
KeyboardEvent.code
```

Initial layouts:

```text
US ANSI
ES ISO
```

---

### 2.10 Low-latency practice

Practice must feel immediate.

Target:

```text
keypress feedback < 50 ms
exercise transition < 150 ms
```

Do not perform network round trips per keypress.

---

## 3. MVP boundaries

### Included in MVP

The MVP includes:

- web application;
- Vim simulation;
- NORMAL and INSERT mode;
- basic navigation;
- semantic movement;
- operators;
- selected text objects;
- undo/redo;
- repeat command;
- declarative exercises;
- attempt telemetry;
- deterministic evaluation;
- mastery;
- adaptive review;
- daily session builder;
- skill map;
- XP;
- combo;
- streak;
- personal best;
- onboarding;
- keyboard layout;
- calibration;
- persistence.

### Explicitly excluded from MVP

Do not implement until the PRD phase requires it:

- real Linux containers;
- server-side Neovim;
- full LazyVim;
- LSP;
- Mason;
- Treesitter;
- Lazygit;
- real-time multiplayer;
- social graph;
- marketplace;
- AI-based evaluation;
- native mobile application.

Do not “prepare” these by adding premature services or dependencies unless a clear interface is required by current work.

---

## 4. Required repository structure

Preferred monorepo layout:

```text
/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── vim-engine/
│   ├── evaluation/
│   ├── pedagogy/
│   ├── exercise-schema/
│   ├── shared/
│   └── ui/
│
├── content/
│   ├── skills/
│   ├── exercises/
│   └── environments/
│
├── docs/
│   ├── PRD.md
│   └── architecture/
│
├── tests/
├── IMPLEMENTATION_PLAN.md
├── AGENTS.md
├── package.json
└── pnpm-workspace.yaml
```

Use `pnpm` workspaces.

Do not add Turborepo unless it provides a clear current benefit.

---

## 5. Package responsibilities

### packages/vim-engine

Owns:

- buffer state;
- cursor;
- modes;
- motions;
- operators;
- text objects;
- insert behavior;
- undo/redo;
- repeat;
- command parsing/state.

Must not depend on React.

Must not know about users, XP, sessions, or persistence.

---

### packages/exercise-schema

Owns:

- Zod schemas;
- normalized content types;
- content validation;
- schema versioning.

---

### packages/evaluation

Owns:

- goal checking;
- strategy classification;
- anti-pattern detection;
- attempt metrics;
- performance score.

It may depend on shared domain types and vim-engine state types.

It must not depend on React.

---

### packages/pedagogy

Owns:

- mastery calculation;
- retention model;
- review scheduling;
- exercise priority;
- unlock rules;
- daily session builder.

Must remain deterministic and unit-testable.

---

### apps/web

Owns:

- visual application shell;
- practice UI;
- keyboard capture;
- onboarding;
- skill map;
- progress UI;
- client state;
- accessibility.

It must consume domain packages rather than reimplement their logic.

---

### apps/api

Owns:

- authenticated persistence;
- attempts;
- sessions;
- skill progress;
- review queue;
- content delivery when required.

Do not make the API part of the keypress loop.

---

## 6. Initial Vim engine scope

The first supported subset is:

### Modes

```text
NORMAL
INSERT
```

### Motions

```text
h j k l
w W
b B
e E
0 ^ $
f<char>
t<char>
;
,
```

### Insert transitions

```text
i
a
o
Esc
```

### Operators

```text
d
c
y
dd
yy
cw
```

### Text objects

```text
iw
i"
a"
i(
a(
i{
a{
```

### Editing

```text
x
p
P
u
Ctrl+r
.
```

Do not expand beyond this subset before the existing commands are tested and stable.

---

## 7. State model expectations

The Vim engine should expose an explicit state similar to:

```ts
interface VimState {
  mode: "normal" | "insert";
  buffer: TextBuffer;
  cursor: Position;
  pendingOperator?: OperatorState;
  pendingMotion?: MotionState;
  repeatState?: RepeatableChange;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
}
```

Exact types may evolve, but state transitions must remain explicit and reproducible.

Avoid hidden global mutable state.

---

## 8. Input model

Input must support:

```ts
interface KeyInput {
  key: string;
  code?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  timestamp?: number;
}
```

The engine should consume logical inputs.

Browser-specific normalization belongs in an adapter.

---

## 9. Exercise model

Every exercise must define at least:

- stable ID;
- slug;
- associated skill IDs;
- mode;
- difficulty;
- environment profile;
- initial state;
- objective;
- one or more known solutions where useful;
- evaluation rules;
- hints;
- anti-pattern definitions or references.

All content must validate before it reaches runtime.

---

## 10. Content rules

### IDs and slugs

IDs and slugs are stable public identifiers.

Do not rename them casually after content is released.

### Versioning

Exercise schema must carry a version.

Content migrations must be explicit.

### Testability

Every declared optimal solution must be automatically executable by the Vim engine.

CI must reject exercises whose declared solution cannot reach the target state.

---

## 11. Attempt telemetry

Capture each logical user input with at least:

```text
timestamp
key
code
mode
cursor before
cursor after
accepted
```

Do not POST every keypress.

Accumulate locally and send attempt data on completion or in safe batches.

Attempt events must be sufficient to reconstruct a future ghost replay.

---

## 12. Evaluation rules

Evaluation has two independent questions:

### Did the user solve the task?

Example:

```text
success = true
```

### How did the user solve it?

Example:

```text
strategy = optimal
```

A user may therefore have:

```text
success = true
strategy = anti-pattern
```

This distinction is required.

---

## 13. Initial anti-patterns

Support or prepare detection for:

```text
repeated_x
excessive_hjkl
arrow_keys
insert_mode_navigation
repeated_escape
```

Do not block completion solely because an anti-pattern occurred unless the exercise explicitly requires it.

---

## 14. Metrics

At minimum calculate:

```text
success
accuracyScore
strategyScore
efficiencyScore
fluencyScore
firstInputLatencyMs
totalDurationMs
keystrokes
unnecessaryKeystrokes
errors
hintsUsed
performanceScore
```

Metric weights must be configuration, not UI constants.

---

## 15. Mastery constraints

A skill must not become `mastered` through immediate repetition alone.

Mastery requires evidence of:

```text
accuracy
strategy quality
fluency
retention
transfer
```

Initial lifecycle:

```text
locked
learning
practicing
fluent
mastered
```

Delayed recall and transfer must gate final mastery.

---

## 16. Scheduling constraints

Do not implement SM-2 blindly.

The scheduler must use available performance signals.

A weak skill should return sooner.

A strong retained skill should be delayed.

The scheduler must be deterministic under a fixed input state/seed so it can be tested.

---

## 17. Daily session builder

A session may contain:

```text
warmup
reviews
learn
mixed
challenge
```

Selection should balance:

```text
review due
weakness
prerequisites
variety
transfer need
recent repetition penalty
```

Avoid long runs of the same command pattern.

---

## 18. UI rules

During active practice:

Show:

- instruction;
- editor;
- Vim mode;
- minimal progress;
- immediate feedback.

Avoid:

- navigation sidebars;
- dense dashboards;
- long explanations;
- unrelated status panels.

Practice UI is intentionally low-distraction.

---

## 19. Accessibility

Required:

- keyboard-only navigation;
- visible focus;
- color is never the only status signal;
- reduced motion support;
- optional sounds;
- adequate contrast;
- keyboard capture scoped to practice area.

---

## 20. Testing policy

New domain behavior is not complete without tests.

### Required unit coverage

- motions;
- mode transitions;
- operators;
- text objects;
- undo/redo;
- repeat;
- evaluation;
- metrics;
- anti-patterns;
- mastery;
- scheduler;
- session builder;
- schemas.

### Integration tests

At minimum:

```text
exercise
→ attempt
→ evaluation
→ mastery update
→ review scheduling
```

### E2E

At minimum by MVP:

```text
onboarding
calibration
daily session
skill progression
returning review
```

---

## 21. CI gates

A pull request should fail if any of these fail:

```text
lint
typecheck
unit tests
content validation
exercise solution validation
build
```

E2E may be moved to a separate CI job if runtime is significant.

---

## 22. Coding conventions

- TypeScript strict mode.
- Prefer small pure functions in domain packages.
- Avoid `any`.
- Avoid deeply coupled classes unless justified.
- Use discriminated unions for domain state.
- Validate external input with Zod.
- Keep UI state separate from domain state.
- Prefer explicit types at package boundaries.
- Document surprising domain decisions, not obvious syntax.

---

## 23. Dependency policy

Before adding a dependency ask:

1. Is this solving a current requirement?
2. Can the behavior be implemented clearly without it?
3. Does it introduce significant bundle/runtime complexity?
4. Does it make the core engine harder to test?

Core domain packages should have very few dependencies.

---

## 24. Database policy

Use migrations.

Never modify production schema manually.

Domain calculations should not be buried in SQL triggers.

Database stores state; domain packages calculate learning behavior.

---

## 25. Performance policy

No network request in the per-key execution path.

Avoid rerendering the entire practice page on every keypress.

Profile before introducing optimization complexity, but preserve an architecture that allows localized editor updates.

---

## 26. Security policy

MVP executes no arbitrary shell command on the server.

Validate all API input.

Rate-limit public/authenticated mutation endpoints appropriately.

Scores calculated client-side must be considered untrusted for future competitive rankings.

---

## 27. Commit discipline for agents

Prefer small coherent changes.

A change should ideally correspond to one ticket or one clear subtask.

Before declaring a task complete:

```text
run typecheck
run unit tests
run relevant integration tests
run content validation when content changed
```

Report:

- files changed;
- tests added;
- tests run;
- unresolved issues;
- intentional deviations.

---

## 28. No silent scope expansion

If a requested implementation appears to require a major feature outside current scope:

1. do not implement the extra feature silently;
2. add the smallest interface needed if necessary;
3. record the dependency/decision;
4. keep current milestone deliverable.

Examples:

Do not add Docker because “Linux labs will need it later”.

Do not add an LLM SDK because “AI hints may be useful”.

Do not implement multiplayer because leaderboards exist.

---

## 29. Current implementation priority

The highest-risk assumption is the browser-based Vim practice loop.

Therefore implementation priority is:

```text
schemas
↓
vim-engine
↓
exercise loading
↓
telemetry
↓
evaluation
↓
single practice screen
```

Before:

```text
auth
database
dashboard
animations
skill map polish
```

---

## 30. Milestone 1 definition

The first technical milestone is complete when the repository can:

1. load one exercise from declarative content;
2. validate it;
3. initialize Vim state;
4. render its buffer;
5. accept supported Vim input;
6. log every input event;
7. reach an objective state;
8. evaluate success;
9. classify the strategy;
10. calculate basic metrics;
11. show a result.

Canonical example:

Initial buffer:

```js
const mode = "development";
```

Goal:

```js
const mode = "production";
```

Expected optimal pattern:

```text
ci"production<Esc>
```

Do not begin auth, database integration, or gamification before this milestone works end-to-end.

---

## 31. Source of truth hierarchy

Use this order:

```text
1. explicit current user instruction
2. docs/architecture/*.md accepted ADRs
3. docs/PRD.md
4. AGENTS.md
5. implementation plan / ticket text
6. existing code conventions
```

If two sources conflict, stop expanding scope and follow the higher-priority source.

---

## 32. Definition of done for any ticket

A ticket is done only when:

- behavior is implemented;
- relevant tests exist and pass;
- types pass;
- lint passes;
- public contracts are documented when changed;
- no unrelated scope was added;
- acceptance criteria are demonstrably met.

A visually complete feature with untested domain behavior is not done.
