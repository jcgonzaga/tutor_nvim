# M1 — Vertical practice slice: architecture notes

Status: implemented. Scope is exactly Milestone 1 (see `IMPLEMENTATION_PLAN.md`).

```text
content/exercises/*.yaml
        │  parseExerciseYaml (Zod, strict)
        ▼
 Exercise (normalized)                    @tutor-nvim/exercise-schema
        │
        ▼
 startAttempt ─► advanceAttempt(key) ─►   @tutor-nvim/evaluation
        │             │  dispatch(state, key)   @tutor-nvim/vim-engine
        │             └► InputEvent log (telemetry)
        ▼
 evaluateAttempt ─► { success, strategy, metrics }
        ▲
        │ renders + captures keys only
  apps/web (React)
```

Dependency direction: `vim-engine` ← `exercise-schema` ← `evaluation` ← `apps/web`.
`vim-engine` has no dependencies and no knowledge of exercises, users or the DOM.

## Decisions worth knowing

- **Packages are consumed as TypeScript source** (`exports` → `src/index.ts`); there is
  no per-package build step. Vite, Vitest and `tsx` all transpile workspace sources.
- **Cursor coordinates.** Content (YAML) uses **1-based** `line`/`column`, like Vim's
  ruler. The engine uses **0-based** `Position`. The conversion happens once, in the
  schema's normalization step. (The canonical `column: 18` is inside `development`
  under either reading.)
- **Key notation.** Solutions are written in Vim notation (`ci"production<Esc>`) and
  normalized to canonical tokens (`<Esc>`, `<C-r>`, `<Space>`, `<lt>`). Telemetry
  records the same canonical token as `logicalKey`, which is what strategy matching
  compares. A literal `<` should be written `<lt>`.
- **`accepted` semantics.** An input is accepted when it is a valid step of a supported
  command in context. Esc in NORMAL is an accepted no-op. Unsupported keys and failed
  commands (`ci"` with no quotes) are rejected, and a rejected input cancels any
  pending command, as in Vim. Rejected inputs are still logged (`arrow_keys` detection
  needs them).
- **Goal vs strategy.** `success` (did the end state satisfy the goal) and `strategy`
  (how) are independent. M1 strategy is basic: a successful attempt whose key sequence
  equals a declared solution takes that solution's classification, any other success is
  `valid`, a miss is `failed`. Rule-based refinement is M3 (T-307+).
- **Completion.** An attempt completes on the first input after which the goal holds
  (buffer equals target, and NORMAL mode when `requireFinalNormalMode`). Completed
  attempts ignore further input.
- **Metrics.** `keystrokes` counts every logical input, including rejected ones.
  `firstInputLatencyMs` is measured from the exercise being shown. `efficiencyScore` is
  `shortest optimal solution / keystrokes` (0–100). Strategy scores live in
  `DEFAULT_METRICS_CONFIG`, not in the UI.
- **Layouts.** The engine reads the logical `key`; `code` is carried through untouched.
  The browser adapter treats AltGr (reported as Ctrl+Alt on some platforms) as a plain
  character so ES ISO symbols are not mistaken for command chords.
- **CI gate for content.** `tests/content.test.ts` executes every declared solution of
  every exercise through the engine and requires the declared classification, so a
  solution that cannot reach its goal fails `pnpm test`.

## Known limitations (intentional, M1)

- Engine subset: `i`, `Esc`, `c` + `i` + `"`, and text insertion. No Backspace/Enter in
  INSERT, no motions, no undo/redo yet (M2).
- `VimState` has no `undoStack`/`redoStack`/`repeatState` yet; they arrive with M2.
- On macOS, Option+key characters (e.g. `{` on ES layouts) report `altKey` and are
  treated as an Alt chord, so they are not typed. Needs a layout-aware approach (M2+).
- Schema fields from the PRD not needed yet are omitted (`allowEquivalentBuffers`);
  unknown keys are rejected so typos in content fail validation.
- No CI workflow yet (T-004), no API (T-003), no skills content/loader (M3).
