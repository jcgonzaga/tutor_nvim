# M3 — Exercise platform: architecture notes

Status: implemented. Content is declarative, validated before it reaches runtime, and evaluated
deterministically, with no exercise-specific application code.

```text
content/skills/*.yaml ─┐
                       ├─► loadContent ─► ContentBundle ─► practice engine ─► evaluateAttempt
content/exercises/*.yaml ─┘   (schemas + cross-checks)                          { success, strategy,
                                                                                  antiPatterns, metrics }
pnpm content:validate  = schemas and cross-references
pnpm content:test      = + every declared solution executed against the Vim engine
```

## Content

- **Skill schema v1** (`content/skills`): `id`, `slug`, `title`, `description`, `domain`, `tier`,
  `prerequisites` (slugs), `concepts`, `tags`, `difficulty`, `enabled`. 14 seed skills from the PRD.
- **Exercise schema v1** adds to M1: `environment`, `antiPatterns`, `hints`, and `metadata`
  (`language`, `context`, `estimatedSeconds`, `transferTags`). 19 exercises cover all 14 skills,
  including three transfer variants of `ci"` (Python, Lua, JSON).
- **Objectives**: `buffer_equals`, `cursor_at`, `mode_equals` and `all` (compound). Only the types
  current content needs exist. Cursor positions in content are 1-based, like the initial cursor.
- **`initialState.setupKeys`**: keys applied before the learner starts, _keeping their undo
  history_. It exists because an undo/redo exercise needs something to undo; the setup is not part
  of the attempt (`attempt.initialState` already includes it, so replay still works).
- **Loader** (`loadContent`/`validateContent`, browser-safe, in `exercise-schema`) reports every
  problem at once: schema errors with file and path, duplicate ids/slugs (per kind), unknown or
  disabled skills referenced by an exercise, unknown or self prerequisites, prerequisite cycles.
  The web app uses the same loader through Vite's `import.meta.glob`; the CLIs read the disk.
- Hints must count 1, 2, 3… with non-decreasing delays, and every exercise needs a solution
  classified `optimal` (it is the efficiency baseline).

## Content gate (`pnpm content:test`, also part of `pnpm test`)

For every exercise: the initial state must not already satisfy the objective; each declared
solution is executed and must reach the objective, with no keys left over after it does, and must
evaluate to the classification it was declared with; solutions declared `optimal`/`efficient` must
not trip an anti-pattern the exercise itself warns about. A structural test also checks that no
file in `apps/web/src` mentions an exercise id or slug.

This gate already caught a real mistake: a YAML literal block drops the indentation of its first
line, so a buffer starting with spaces needs an explicit indent indicator (`|2`).

## Evaluation

Evaluation answers two independent questions: `success` (did the end state satisfy the objective)
and `strategy` (how). All tunables live in `EvaluationConfig` (metrics, strategy bands,
anti-pattern thresholds), never in the UI.

### Strategy rules

`classifyStrategy` runs an ordered list of rules; the first one with an opinion decides, and the
list is data (pass your own to extend or reorder):

1. **failed**: the objective was not reached.
2. **declared solution**: an exact declared key sequence takes the classification it was declared
   with. The author's word wins, even over anti-pattern detection.
3. **anti-pattern**: the attempt shows a habit the exercise opted into.
4. **efficiency**: `optimalKeystrokes / keystrokes` (rejected inputs count as keystrokes):
   ≥ 1.0 optimal, ≥ 0.7 efficient, ≥ 0.4 valid, otherwise inefficient.

### Anti-patterns

Only those listed in the exercise's `antiPatterns` are detected, and detection never blocks
completion. Thresholds are configuration.

| Id                       | Detected when                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `repeated_x`             | 3+ consecutive `x` presses in NORMAL mode                                                   |
| `excessive_hjkl`         | 4+ h/j/k/l presses in NORMAL mode **and** more than the optimal solution's keystrokes       |
| `arrow_keys`             | any arrow key in any mode (the engine rejects them, the browser adapter still records them) |
| `insert_mode_navigation` | an arrow/Home/End/PageUp/PageDown key while in INSERT mode                                  |
| `repeated_escape`        | 3+ consecutive Escape presses                                                               |

`excessive_hjkl` follows the task: an exercise whose optimal solution is `jjlll` simply does not
list it.

### Metrics v1

All scores are 0–100 and a failed attempt scores 0 everywhere ("never reward fast incorrect
behavior").

| Metric              | Definition                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `accuracyScore`     | share of inputs the engine accepted                                                                       |
| `strategyScore`     | table per classification (optimal 100 … anti-pattern 20)                                                  |
| `efficiencyScore`   | shortest optimal solution ÷ keystrokes                                                                    |
| `fluencyScore`      | weighted mean of first-input, median and maximum inter-key latency bands, **scaled by accuracy**          |
| `independenceScore` | 100 minus a penalty per hint used                                                                         |
| `performanceScore`  | 0.35 accuracy + 0.25 strategy + 0.15 efficiency + 0.15 fluency + 0.10 independence (weights configurable) |

Also reported: `firstInputLatencyMs`, `medianInterKeyLatencyMs`, `maxInterKeyLatencyMs`,
`totalDurationMs`, `keystrokes`, `unnecessaryKeystrokes`, `errors` (rejected inputs), `hintsUsed`.

**Decision (confirmed): `recovery` is `independence`.** PRD 25 lists a `recovery` weight (0.10)
without defining it, and PRD 24 omits it from `AttemptMetrics`. What is implemented is "finishing
without leaning on hints", so it is named for what it measures: `independenceScore` and
`weights.independence`. The weight keeps its PRD value. A true "recovery after an error" metric
was considered and deliberately not built; if the PRD later defines it, it can be added as a
separate component without touching this one. This is an intentional deviation in naming only.

### Hints

Progressive and timed: level N can be requested once its `afterMs` has passed since the exercise
was shown, and only after level N-1. Asking is an explicit action, so every hint shown counts as
used. The logic is pure (`hintStatus`, `canRevealHint`, `revealHint`); the UI only owns a timer
that re-enables the button.

## Known limitations

- Content volume is the M3 minimum (19 exercises, 14 skills); M7 brings it to ~20 skills and 100+
  exercises.
- `excessive_hjkl` and `repeated_x` count presses, not intent: a learner who legitimately needs
  four `j` presses on a task whose optimal solution is shorter is flagged.
- There is no Backspace in INSERT yet (M2 subset), so a typo while typing replacement text cannot
  be corrected inside INSERT mode; the learner retries.
