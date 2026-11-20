# Workspace user stories — files, buffers, windows and sessions

Feature 3 of 3 requested by the owner. Status: **planned** (specs and tasks frozen; implementation not
started). Design: [ADR-0006](../../docs/architecture/adr/0006-tooling-layers.md),
[M12](../../docs/architecture/m12-tooling-layers-and-workspace.md).

## Specs

**S1** — "elegir un archivo, editarlo, volver a seleccionar otro archivo, pasar de un archivo a otro":
the simulated workspace holds several files, several open buffers and one active file, and an
objective can assert which one is active and what each buffer contains.

**S2** — "igual que con Omarchy, abrir mas ventanas, cerrarlas, redimensionarlas": the workspace holds
a window tree (splits, panes, tabs, workspaces) with focus, size and order, and an objective can
assert the layout, the focus and the size change, not the keystrokes.

**S3** — "obten estos procesos usuales de usuario dev y añadelos": the twenty stories listed below
become skills with exercises, prerequisites and transfer tags, in the order they appear in a
developer's day.

**S4** — A new package `packages/workspace-engine` owns the state: file tree, buffers, window tree,
focus path, pending prefix. Pure `(state, key) -> state`, no clock, no I/O, no globals (AGENTS.md
2.3), so a story can be replayed in a test without a browser.

**S5** — Every declared solution is executed by the engine in CI (AGENTS.md 10), and an objective is
satisfiable by more than one strategy, classified by cost, never by one blessed keystroke string.

**S6** — The stories are simulated: no containers, no server-side Neovim, no real processes, no
timers. What is not modelled is absent from the objective, never faked.

**S7** — Each story is keyboard-only, with visible focus and no color-only state (AGENTS.md 19).

## The twenty stories

**Files and buffers**: 1 open a file by name, edit, save · 2 find a file by fuzzy name · 3 grep the
project and jump to the match · 4 jump back to the file you were editing · 5 list buffers and pick one
· 6 create a new file, write, save · 7 close a buffer without quitting · 8 rename a file from the
shell and reopen it.

**Windows and panes**: 9 split vertically and show two files · 10 move the cursor to the other window
· 11 resize the split · 12 close one split and keep the other · 13 zoom a pane and restore it · 14 swap
two windows.

**Sessions and the desktop**: 15 open a new terminal window and focus it · 16 close the focused window
and recover focus · 17 move a window to another workspace and come back · 18 widen a window in resize
mode, then leave it · 19 split a tmux pane, run the tests there, return to the editor pane, kill the
pane · 20 detach the tmux session, reattach, find the editor still open.

## Tasks

| ID  | Spec   | Route                                                                                                                                                              | Commit                                     |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| T1  | S4     | `packages/workspace-engine`: files, buffers, active buffer, `:` command line, oracle tests                                                                         | `25dad94`                                  |
| T2  | S2, S4 | window tree, splits, resize, zoom, swap, tabs and workspaces as actions                                                                                            | `79bfd86`                                  |
| T3  | S1, S2 | `kind: workspace` + objectives (`active_file`, `open_buffers`, `buffer_text`, `file_text`, `layout`, `focus`, `split_ratio`, `all`) + `evaluateWorkspaceObjective` | `a24807e`                                  |
| T4  | S5     | evaluation: action solutions, strategy classification, CI replay                                                                                                   | `7d6628b`                                  |
| T4b | S4, S5 | files and buffers as actions, each naming its path, and a solution that names it                                                                                   | `176e4a2`                                  |
| T5  | S3     | content: stories 1-8 (files and buffers) — stories 1-7 landed, story 8 waits on a shell action                                                                     | `611db28`                                  |
| T5b | S3, S4 | `edit.insert`: typing is an action, so stories 1 and 6 become whole                                                                                                | `270c3eb`                                  |
| T5c | S3, S4 | the picker as a deterministic query: `file.find`, `grep.project`, `buffer.list`, the `grep_matches` goal, stories 2, 3 and 5                                       | `7163d25`, `371267f`, `c6c8f5a`            |
| T6  | S3, S1 | windows and panes: the `windows` and `zoom` goals, the resize/swap catalog rows, six skills and stories 9-14                                                       | `b168c44`, `57bcce9`, `d7e14da`            |
| T7  | S3, S2 | terminals, sessions, workspaces and resize mode in the engine, then six skills and stories 15-20                                                                   | `0f4d75c`, `e22e698`, `11cec6c`, `9843137` |
| T8  | S7, S1 | the practice view: an attempt that can advance, keys to actions, panes, terminal view, i18n                                                                        | `61705a8`, `5d538b0`                       |
| T8  | S7     | web: workspace view, layout rendering, focus ring, keyboard only                                                                                                   | pending                                    |
| T9  | S4-S6  | API: replay of workspace attempts with the same engine                                                                                                             | pending                                    |

## Log

**L1 — original request (verbatim)**

> Revisa el proyecto y quiero hacer modificaciones:
>
> - Hay que añadir la opcion de volver a hacer el ejercicio cuando el usuario no lo puede hacer.
> - Vamos a añadir los atajos de teclado de Herdr, Omarchy, se tiene que poder elegir si el sistema ejecuta comandos y keybindings de Linux, nvim, Lazyvim, Herdr, Tmux, Omarchy, uno, varios o todos.
> - Hay que añadir mas historias de usuario, tipo, elegir un archivo, editarlo, volver a seleccionar otro archivo, pasar de un archivo a otro, es decir, procesos usuales de usuario, igual que con Omarchy, abrir mas ventanas, cerrarlas, redimensionarlas, etc. obten estos procesos usuales de usuario dev y añadelos

**L2 — owner decisions**

> Corte: "3 features secuenciales, con documento ODD cada una"
> Capas: "Capa como ambiente: perfil de keymap junto al simulador"
> Alcance MVP: "ADR + milestone nuevo, y actualizar AGENTS.md"

**L3 — evidence (current state)**

- `packages/vim-engine` has one buffer and one window: no buffer list, no `:e`, no splits
  (`packages/vim-engine/src/types.ts`).
- `packages/shell-engine` has a file tree and a working directory, but no windows, panes or sessions
  (`packages/shell-engine/src/fs.ts`, `commands/files.ts`).
- Objectives today can assert buffer text, the file tree, the working directory and the last output
  (`packages/exercise-schema/src/schema.ts`); none of them can assert focus or layout.

## Design for T1 (workspace engine v1)

Decided here, not by the implementer. T2 (windows) and T3 (objectives) build on it.

**The package never edits text itself.** `packages/vim-engine` already owns buffer text, cursor,
modes and undo. A workspace holds one `VimState` per open buffer and delegates every editing key to
`dispatch`; duplicating that logic in a second package would give two answers to "what does `ci"` do"
and the exercise could only be wrong. What the workspace owns is everything _around_ the buffer: the
files on disk, which buffers are open, which one is active, and (from T2) where they are shown.

```ts
interface WorkspaceState {
  readonly files: Readonly<Record<string, string>>; // path -> text, the simulated disk
  readonly cwd: string; // where a shell command would run
  readonly buffers: readonly WorkspaceBuffer[]; // open buffers, in the order they were opened
  readonly activeBufferId: string; // never empty: opening one creates it
  readonly pending: PendingWorkspaceCommand | null; // a half-typed `:e ` or `<C-w>`
}
interface WorkspaceBuffer {
  readonly id: string; // stable, derived from the path: "buf:src/main.ts"
  readonly path: string; // path on the simulated disk
  readonly editor: VimState; // the text, cursor, mode and undo of that buffer
  readonly modified: boolean; // true when the buffer differs from the file
}
```

- `createWorkspace(input)` takes the files, the starting path and the cwd, and opens one buffer.
- `dispatchWorkspace(state, key: KeyInput)` is pure and total: it never throws on a key it does not
  know, it returns `{ state, accepted }` the way the other engines do, and `accepted: false` means
  the key was not consumed and the caller may still ignore it.
- Command entry is a pending state, mirroring `vim-engine`'s `pending`: `:` opens a command line,
  printable keys and Backspace edit it, `Esc` cancels, `Enter` runs it. T1 runs `:e <path>`,
  `:w`, `:bn`, `:bp` and `:ls`; an unknown command is `accepted: false` with the reason kept for the
  UI, never a silent no-op.
- **No clock, no I/O, no id generation from randomness**: buffer ids come from paths, so a replay is
  the same state. Saving writes into `files`; nothing touches a real filesystem.
- Editing keys go to the active buffer's `editor` through `vim-engine`'s `dispatch`. NORMAL-mode
  keys the workspace owns (`:`) are intercepted _before_ the editor sees them; everything else
  reaches it unchanged, so an exercise can never be wrong because two key paths disagree.
- Oracle tests: for each supported command, replay a recorded key sequence and assert the whole
  resulting state (files, buffers, active id, buffer text, cursor, modified flags), not one field.
  The same sequence replayed twice must give the same state (determinism), and a rejected key must
  leave the state identical.

Out of scope for T1: window tree and layout (T2), workspace objectives in the schema (T3), the web
view (T8), anything that needs a real file, process, timer or container (S6).

**L4 — evidence (T1)**

- `packages/workspace-engine` exists with the state fixed in "Design for T1": files, cwd, open buffers
  (one `VimState` each), the active buffer, the command-line pending state and the last command result.
  22 oracle tests assert the whole state per command, determinism, a rejected key leaving the state
  byte-identical, and `:e` focusing an already open buffer instead of duplicating it.
- Known limits, decided rather than discovered later: paths are matched verbatim (no `cwd` resolution,
  no normalisation, no spaces) until T3 or T8 needs it; `createWorkspace` opens a starting path that is
  not on disk as an empty buffer while `:e` rejects a missing path, because both are what the
  spec's stories need; a rejected command records itself in `lastCommand`, so "nothing changed" holds
  for the editor and the command line, not for that record.
- Independent verification found one real defect and it is fixed: opening the command line left the
  editor's pending operator armed (`d` then `:` then `:w` saved a buffer with `delete` still waiting),
  where Vim cancels it. `:` now cancels through the editor and stores the result; pinned test-first.
- The verifier's own probes became `workspace.regression.test.ts`: purity (frozen input, unknown keys,
  identical replays), parity with `vim-engine` on `ci"production<Esc>`, `modified` clearing on undo, an
  off-disk starting path opened as an empty buffer, and paths matched verbatim.
- Not touched: windows (T2), objectives (T3), the web view (T8), any real file, process, timer or
  container (S6).

## Design for T2 (windows, panes and sessions)

Decided here. T2 extends the T1 state; T3 asserts it, T8 renders it.

**Window operations are actions, not keys.** The layer catalogs already map keys to actions
(`window.split-side-by-side`, `window.zoom`, `tab.next`, `workspace.switch`, …) and
`packages/keymap` already resolves an enabled layer's keys to one of them (S5, S6). So the engine
exposes `applyWorkspaceAction(state, action, options?)` and never learns about prefixes: tmux's
`C-b %` and Herdr's `C-b v` reach the same action and therefore the same split. `dispatchWorkspace`
from T1 keeps owning text and the `:` command line; window keys go through the resolver first.

```ts
type WindowNode =
  | { kind: "leaf"; bufferId: string }
  | {
      kind: "split";
      layout: "side-by-side" | "stacked";
      ratio: number;
      first: WindowNode;
      second: WindowNode;
    };
interface WorkspaceTab {
  readonly id: string;
  readonly root: WindowNode;
  readonly focus: readonly ("first" | "second")[];
}
```

- `ratio` is a number in `[0.1, 0.9]`: the engine models _what changed_, never pixels, so a resize is a
  ratio step of 0.05 and stays deterministic.
- `focus` is the path from the root to the focused leaf. `activeBufferId` follows it: focusing another
  window focuses its buffer. Closing the focused leaf hands focus to its sibling's last leaf.
- `zoom` is `{ tabId, leafPath }` or `null`: zooming does not change the tree, so restoring it is free.
- `swap` exchanges the two leaves' buffers, leaving the tree shape and the ratios alone.
- `tabs` and `activeTabId` live in the state; `workspace.switch` selects a tab, matching how the
  catalogs name it (`tab.next`, `tab.new`, `workspace.switch`).
- Every operation is total: an action that cannot apply (no sibling to focus, one leaf to close,
  a ratio already at its bound) returns the same state with `applied: false` and a reason, never a
  throw and never a silent no-op.
- Oracle tests: whole-state assertions for each action, an invariant suite (focus path always reaches
  a leaf, `activeBufferId` always equals that leaf's buffer, ratios inside their bounds, no empty
  split), determinism, and parity between two layers' keys reaching the same action.

**L5 — evidence (T2)**

- The window tree, tabs, focus paths and zoom are in `packages/workspace-engine`, behind
  `applyWorkspaceAction` with the eighteen window/tab/workspace actions of the vocabulary; the
  engine still knows nothing about keys or prefixes. 42 oracle tests plus an invariant suite
  (focus reaches a leaf, `activeBufferId` equals that leaf's buffer, ratios in [0.1, 0.9], both
  children present, no buffer registered twice, every leaf on an open buffer) and determinism.
- **Owner decision, because the T2 design was silent and it could not be inferred:** a split shows the
  focused buffer in _both_ panes, which is what tmux and nvim do and what stories 9-10 need. The
  invariant is therefore "no buffer id twice in `state.buffers`", not "never shown twice". Changing it
  later is a behaviour change, not a test tweak.
- Also decided here: buffers stay open after `window.close`; `window.new` needs `options.path` on disk
  because no applications are modelled (S6), so story 15 (a new terminal window) stays unmodelled until
  a terminal exists; `workspace.switch` takes `options.tabId` and falls back to cycling; zoom toggles and
  survives a tab switch while its window still exists.
- The T1 command line follows the focused window now (`:e`, `:bn`, `:bp`), pinned by a differential
  over eleven command scripts against the T1 code: no differences.

## Design for T3 (workspace exercises and their objectives)

Decided here. T4 replays and classifies; T8 renders.

**A workspace exercise is content like any other**, with `kind: workspace` and its own initial state and
objective:

```yaml
kind: workspace
initialState: { files: { "src/main.ts": "…" }, path: "src/main.ts", cwd: "/project" }
objective:
  type: all
  goals:
    - { type: active_file, path: "src/other.ts" }
    - { type: layout, text: "side(leaf, leaf)" }
    - { type: split_ratio, index: 0, ratio: 0.5 }
    - { type: focus, leaf: 1 }
    - { type: buffer_text, path: "src/main.ts", text: "…" }
solutions:
  - actions: [file.find, file.open, window.split-side-by-side] # actions, never keys (S5)
    classification: optimal
```

- **The layout objective is a string the engine prints, not a second tree grammar.** `layoutText`
  serialises the tree pre-order: `leaf` for a window, `side(a, b)` / `stacked(a, b)` for a split. Content
  reads exactly what a person would draw, and there is one implementation of "what shape is this".
- `focus` is the pre-order index of the focused leaf; `split_ratio` addresses a split by its pre-order
  index among splits and compares with a tolerance of 0.01, because floats are compared, not stored as
  text. `active_file`/`buffer_text` take the path; `open_buffers` takes a set (order is not the point);
  `file_text` asserts the disk, so saving is observable.
- Objectives decide the END STATE only (AGENTS.md 13, S5): never a keystroke, never a strategy.
- `solutions` are action lists, validated against the keymap vocabulary, with exactly one `optimal` like
  the other kinds. Replaying them, classifying strategy from their cost and running them in CI is T4;
  T3 only makes them expressible and checks the objective against a state.
- `packages/evaluation` gains `evaluateWorkspaceObjective(objective, state)` returning the same
  `{ met, failures }` shape the other kinds use, so a screen shows which goal failed rather than "wrong".

**L6 — evidence (T3)**

- The engine prints the layout (`layoutText`: `leaf`, `side(a, b)`, `stacked(a, b)`), the focus index and
  the split ratios; the objective compares against those strings, so there is one implementation of
  "what shape is this". Focus is the focus-path index, not a buffer lookup: a split shows one buffer
  in both panes, so a buffer lookup would answer 0 for the second leaf.
- `kind: workspace` and its eight objectives exist, with action solutions validated against the
  vocabulary. **`parseExercise` still rejects workspace content on purpose** until T4 replays action
  solutions, so `ContentBundle` cannot hold an exercise nothing can run, and T5 cannot land before T4.
- Two declarations of the projection shape (`WorkspaceObjectiveView` in the engine,
  `WorkspaceObjectiveState` in evaluation) exist only because T3 adds no dependency; a type probe proved
  them mutually assignable, but nothing committed pins it. T4, which imports the engine, must unify them.
- Independent verification: the 168 real exercises parse identically before and after (168/168, 0
  differences), `actionSolutionSchema` and `sameLines` behave the same, and 1152 tests passed. It found
  one defect: `split_ratio` rounded the difference, accepting 0.514 for 0.50 — further than a resize
  step. The hundredth is now the bound itself, with an epsilon only for binary floating point.
- Process note: `vitest` was green on the test that called `state({...})` while `tsc` failed, because the
  unit runner does not type check the test file. That is why `pnpm typecheck` is its own gate and not a
  formality.

## Design for T4 (replay, strategy and the CI gate)

Decided here. T4 is what makes `kind: workspace` loadable and the twenty stories writable (T5-T7).

- **The workspace kind joins `Exercise`.** That union has two members today and several consumers narrow
  on it: `goalMet`, `startAttempt`, `antipatterns`, `content-check`, `validate`, `content.ts`,
  `apps/web` (practice, layer rail, feedback) and `apps/api` (attempts, content sync). Each gets the
  branch its kind needs; a consumer that genuinely cannot handle a workspace attempt says so with a
  message instead of guessing. `packages/evaluation` takes its `@tutor-nvim/workspace-engine`
  dependency here, which also removes the duplicated projection shape from T3: evaluation imports the
  engine's type and its own declaration is deleted.
- **Replay**: `simulateWorkspaceSolution(exercise, solution)` starts from `initialState`, applies the
  solution's actions in order through `applyWorkspaceAction`, and returns the end state plus the first
  action that was refused (an action the engine cannot apply is a content bug, not a learner error).
  Replay needs no layer: the solution names actions.
- **Success is the objective, strategy is the cost** (AGENTS.md 12, S5): `goalMet` for the workspace kind
  evaluates `evaluateWorkspaceObjective`; the classification reuses the existing rule order and bands,
  with the attempt's cost in actions. A learner who reaches the same end state with a longer action
  list gets a lower classification, never a failure.
- **CI**: `pnpm content:test` replays every declared workspace solution and fails naming the exercise,
  the solution and the objective that was not met; `pnpm content:validate` keeps the keymap rules from
  T7 and gains one for workspace content: an action in a solution that no catalog provides is an error,
  so a story cannot ask for something no layer can do.
- Anti-patterns for this kind are declared, not invented: T4 adds no new ids and leaves
  `antiPatterns: []` for workspace content until a story needs one, recorded here.

**L7 — evidence (T4), and the wall T5 hits**

- `kind: workspace` is loadable now: it joined the `Exercise` union, `parseExercise` accepts it and every
  consumer that narrows on `kind` got its branch — the practice screen shows an explicit notice instead
  of a broken editor, the API answers `422 unsupported_exercise_kind` rather than guessing a replay.
- Replay, objective and strategy are in place: `simulateWorkspaceSolution` applies the solution's actions
  and reports the first refusal as a content bug; `goalMet` judges the end state; the classification
  reuses the same rule order and bands with the cost in actions, so a longer action list lowers the
  grade and never fails. `pnpm content:test` replays every declared workspace solution, and
  `content:validate` rejects an action no catalog provides. Evaluation now depends on the workspace
  engine and the duplicated projection type from T3 is gone.
- **The wall for T5, found by this task and not worked around:** `applyWorkspaceAction` handles only the
  window, tab and workspace actions. A solution written with `file.open` / `buffer.next` is a content
  bug the gate reports ("Unknown workspace action: file.open"), because opening a file is a `:` command
  in the engine, not an action. So stories 1-8 (files and buffers) cannot be written until the engine
  applies the `file.*` and `buffer.*` actions too — that is a T4b slice, decided here as the next step
  before T5.
- Process: the lockfile had to be regenerated by hand (`pnpm install`) because the child could not touch
  it; a `--frozen-lockfile` checkout would have failed until then.

## Design for T4b (files and buffers as actions)

Decided here, because T5's first eight stories depend on it.

"Opening a file is a `:` command, not an action" is true of the engine as built, not of the stories:
a learner who opens `src/other.ts` with Goto-file in LazyVim, with `:e`, or with `n` in tmux's
file picker is doing **one** thing. So the engine learns to apply the `file.*` and `buffer.*` actions
the vocabulary already has, and the command line keeps working beside them.

| Action                            | Applied when                                                                        | Otherwise                              |
| --------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
| `file.open`                       | `options.path` is on disk or already open; focuses it, opening a buffer when needed | `applied: false` naming the path       |
| `file.new`                        | `options.path` is not on disk; opens an empty buffer                                | `applied: false` when the path exists  |
| `file.save`                       | the active buffer is modified; writes it and clears `modified`                      | `applied: false` with the reason       |
| `file.close-buffer`               | another buffer stays open; the focused leaf falls back to it                        | refuses to close the last buffer       |
| `buffer.next` / `buffer.previous` | another buffer exists; cycles in open order                                         | `applied: false` when only one is open |

- `file.find`, `grep.project`, `buffer.list`, `file.close-buffer`'s picker siblings and every other
  action that needs an interactive picker stay **unapplied with a reason**: S6 says what is not
  modelled is absent, never faked. A story that needs a picker waits for a picker, and the gate's
  message says which action is missing.
- The command line and the actions must not disagree: `:e <path>` and `file.open` reach the same state
  function, and one oracle test asserts they do. That is the whole reason both exist.

**L8 — evidence (T4b): files and buffers are actions, and a solution can name its file**

- `applyWorkspaceAction` applies `file.open`, `file.new`, `file.save`, `file.close-buffer`,
  `buffer.next` and `buffer.previous`; the command line and the actions share one state function
  (`files.ts`), so `:e <path>` and `file.open` cannot reach two different workspaces. Picker-shaped
  actions (`file.find`, `grep.project`, `buffer.list`) stay unapplied with a reason: S6 says what is not
  modelled is absent, never faked.
- A workspace solution action may now carry `path`, allowed only for `file.open` and `file.new`, with a
  non-empty relative path. The vim and shell kinds keep their own action schema byte-for-byte, so `path`
  cannot leak into them (differential over the 168 real exercises: 0 differences).
- The test T4b invalidated was re-pointed, not deleted: `app.launch-terminal` now pins the unknown
  action refusal and `file.find` its own picker refusal.
- Decided where the table was silent: `file.new` refuses a path whose buffer is already open; closing a
  buffer falls back to the next one in open order, or the previous one when it was last; closing a
  modified buffer is allowed.
- Known wording gap: the content gate prints a solution action without its path, so two solutions that
  differ only by file read the same in a message. Recorded for the slice that next touches the gate.

**L9 — evidence (T5, partial by design) and the gap it exposed**

- Eight skills and seven `kind: workspace` exercises are content now, with their Spanish overlays; the
  gate replays all 221 solutions of 175 exercises, including the new workspace ones.
- **Three of the eight stories cannot be expressed and were left out instead of faked:** 2 (fuzzy find),
  3 (grep and jump) and 8 (rename from the shell) need actions the engine refuses as pickers
  (`file.find`, `grep.project`, `buffer.list`) or a shell rename that does not exist as an action.
  Stories 1 and 6 ship reduced to their expressible half: open, create.
- **The gap that reduction exposed, and the next slice:** no action can modify buffer text, so
  `file.save` is unreachable in a replay and a story can never say "type this". Opening and creating
  files is a workspace concern; typing is not. Decision: add `edit.insert` with a `text` field to the
  vocabulary — the engine applies it by delegating to `vim-engine`'s INSERT, exactly as the workspace
  already delegates every editing key. Content then says what is typed without naming a layer's keys,
  and stories 1, 6 and 8 become whole.
- Two honesty notes on the content: three of the new skills (`neovim.files.find`,
  `neovim.search.grep-project`, `linux.shell.rename-file`) are theory-only until their stories can be
  expressed, and the gate's declared-solution rule matches on action and target only, so alternatives
  were kept distinct by action name; their bands were chosen by hand and are not pinned by a test yet.

**L10 — evidence (T5b): typing is an action, and stories 1 and 6 are whole**

- `edit.insert` with a required `text` is in the vocabulary and the engine applies it by delegating to
  `vim-engine`'s INSERT (`i`, the characters, `Esc`), so the workspace still never edits text itself.
  `text` is legal only there, like `path` is legal only for `file.open`/`file.new`; the vim and shell
  kinds keep their own action schema.
- The content gate learns the exception the vocabulary forced: an action that carries text is not
  something a keymap binding can provide — typing is the one action every layer performs by typing —
  so the "no catalog provides it" rule skips exactly those. A test proves both sides: the text action
  passes, an unprovided key-shaped action still fails with the same message.
- Stories 1 and 6 are whole now: open or create, type, save, with objectives asserting the simulated
  disk. Typing starts where a fresh buffer leaves the cursor (top of the file), so content prepends;
  an edit mid-file waits for a cursor action that does not exist yet.
- Still out, and now for one reason only: stories 2, 3 and 8 need pickers (`file.find`, `grep.project`,
  `buffer.list`) or a shell rename action. Those are engine capabilities, not content work.

## Design for T5c (the picker, decided)

Owner said searching is shorthand for "a normal editing session", the project's files are fixed, and the
point is a chain of commands that makes sense. So the picker is modelled as a **deterministic query**,
not as an interactive fuzzy scorer:

- `file.find` takes a `query` (the fragment the learner types) and opens the **first match** of the
  project's files in sorted order; `file.find` with no match is refused naming the query. A story then
  reads: find by fragment, edit, save — a sequence a person actually performs.
- `grep.project` takes a `query` and records the matching (path, line, text) rows in the state, in a
  stable order. An objective can assert the matches and the file the learner then opens; the picker's
  _rendering_ is T8's job, not the engine's.
- `buffer.list` takes a `path` and focuses that open buffer: the buffer picker without pretending to
  rank anything.
- No scoring, no timers, no "best match": with fixed files, sorted order plus the query is deterministic
  and a replay is the same state. What is not modelled stays refused with a reason.

**L11 — delivery strategy (recorded at the slice boundary)**

- This work landed on `main` in reviewable-by-unit commits, but the whole is far past a single review
  slice: 24 commits and ~14k authored lines since the branch point, across two features. The delivery
  strategy is therefore **chained slices, not one pull request**, and the boundaries are already marked:
  `review/keymap-schema`, `review/keymap-catalogs`, `review/layers-and-resolver`, `review/layer-rail` for
  the keymap feature, and for this one `T1+T2` (engine), `T3` (objectives), `T4+T4b+T5b` (replay and
  content) and `T5c` (picker, next).
- A future reviewer should read the feature log first: every non-obvious decision (save/close semantics,
  the split's buffer rule, the text action, the picker as a query) is recorded with its reason, and the
  decisions the owner made are marked as such.

**L12 — evidence (T5c): the picker is a query, and stories 2, 3 and 5 are whole**

- The engine answers a query from the project, not from a scorer: `file.find` opens the first file in
  _path_ order whose path holds the fragment (case-insensitively), `grep.project` records the matching
  `(path, line, text)` rows in that same order into `state.matches`, and `buffer.list` focuses the open
  buffer a path names. `picker.test.ts` pins the four properties that make a replay meaningful: path
  order over disk order, case-insensitivity, determinism (same query twice, same state), and one
  refusal shape per refusal (`file.find: no file matches "…"`, `grep.project: no line matches "…"`,
  `buffer.list: no buffer is open for "…"`, and the empty-query refusals), each asserting the state is
  unchanged.
- The schema follows the same rule as `path` and `text`: `query` is required for
  `KEYMAP_QUERY_ACTIONS` (`file.find`, `grep.project`) and rejected everywhere else, so the field
  cannot be carried by a verb that searches nothing. `buffer.list` joins `PATHED_ACTIONS`; it picks an
  _open_ buffer, so a file that exists but was never opened is refused rather than opened by stealth.
- The objective `grep_matches` compares rows in order and prints both sides on failure. Order is part of
  the goal because the search's answer is what the learner reads: a reordering is a different list.
- Stories 2 (find a file by a fragment), 3 (grep the project, open the file of a match) and 5 (pick a
  buffer out of the list) are content now, with their ES overlays. Story 5's lesson changed: it taught
  `buffer.next` while claiming `neovim.buffers.list`, so its optimal run is now `buffer.list` by path
  and only stepping back remains as the costlier route.
- Story 8 (rename a file from the shell and reopen it) is the one story of cluster 1 still out, and for
  one reason: the workspace engine has no shell action yet. That is a T4b-shaped gap (an action that
  names its command), not a picker gap.
- Evidence: `pnpm typecheck` green; `pnpm content:ci` green (37 skills, 177 exercises, 224 solutions
  reach their objective); `pnpm test` at 60 failed / 1990 passed, and every failure is accounted for
  below. Baseline measured on a detached worktree of `4a251e9` for the curriculum suite: 16 failures
  there against 15 now, so this slice closes one and opens none.
  - `packages/shell-engine/src/oracle.test.ts` (42): the simulated shell against _this host's_ bash and
    coreutils, failing on umask-derived modes (664/775 vs 644/755) and `ls` formatting. Nothing in the
    diff touches `shell-engine`; the same 42 fail at `4a251e9`.
  - `tests/curriculum*.test.ts`, `tests/content.test.ts`, `tests/pedagogy-flow.test.ts`: content
    coverage gates demanding at least five exercises per skill with a second context. Every skill named
    is one whose stories are T6/T7 work, and the same eight curriculum failures exist at `4a251e9`.
  - `tests/gamification-sync.test.ts` (2): the server rejects workspace submissions because the API
    cannot replay a workspace attempt yet — exactly T9. Not new: the eight stories of `611db28` already
    put the device ahead of the server.
  - `tests/cloud-sync.test.ts` and `apps/api/src/gamification.test.ts` fail only inside a whole-suite run
    (10 s hook timeout from parallel load); run alone they pass 14/14 and 18/18.
- The embedded content the API serves had drifted behind `content/` (it named 28 skills for 36), so
  `pnpm content:embed` is regenerated in `f05d6f4`; the equality test that guards it passes again.
- **Slice boundary, recorded again:** 15,095 authored changed lines in 29 commits on `main` since the
  branch point. `T1+T2`, `T3`, `T4+T4b+T5b` and `T5c` are the boundaries; the next slice is `T6`.

**L13 — evidence (T6): windows are on screen, so the stories can be written**

- Two goals were missing before a single window story could be told, and both are answered from the
  tree instead of from a new state field. `windows` asserts the path each leaf shows, in pre-order:
  a split is the same file twice, a swap is the same two files the other way round, and
  `open_buffers` cannot say either, because it is the set of what is loaded. `zoom` asserts the path
  the zoomed window shows, or `null` for none, because zoom is a note beside the tree and a learner
  who zoomed and restored prints the same layout as one who never touched it.
- Both are test-first: the RED tests are the `windows`/`zoom` cases in `workspace-goal.test.ts`, the
  parser cases in `workspace.test.ts` and the projection cases in `serialize.test.ts`. Writing the
  swap case is what proved the engine already got it right: `withTabs` re-derives `activeBufferId`
  from the focused leaf, so after a swap the cursor stays in the pane and the active buffer becomes
  the neighbour's file. The test now pins that.
- The nvim catalog gained the five rows the stories needed and no catalog had: `C-w>`, `C-w<`,
  `C-w+`, `C-w-` (`window.resize-*`) and `C-wx` (`window.swap`), each carrying the same `notModelled`
  note as its neighbours, because `packages/vim-engine` still models one window. Without them the
  gate would have refused any solution that resizes or swaps.
- Six skills — `neovim.windows.{split,focus,resize,close,zoom,swap}` — and six stories (9-14), with
  their ES overlays: split and open a second file, move back with the direction key, step the ratio
  to 0.65, close the pane without closing the file, zoom to edit and restore the layout, and trade
  the two panes. Every story asserts the _end state_ only, which is why story 13 edits and saves
  while zoomed: a zoom that is undone is invisible to a replay, so the story proves the detour with
  the text it left on disk.
- Evidence: `pnpm content:ci` green (43 skills, 183 exercises, 232 solutions reach their objective
  with the classification they declare); `pnpm typecheck` green; the workspace, evaluation and schema
  suites at 407 tests green. The embedded API copy is regenerated again (`content:embed`), so the
  equality test passes with the new content.
- Two failures in the full run are worth naming so nobody reads them as regressions. The three
  `tests/content-ci.test.ts` cases that failed mid-slice were the fixture rotting under the new
  catalog rows, not the gate breaking, and they are fixed by reading the unprovided action out of the
  copy. And the DB-backed files (`tests/cloud-sync.test.ts`, `apps/api/src/{api,db,gamification,platform,sessions}.test.ts`)
  fail on a ten-second `beforeEach` hook: `openTestDb` (pglite) takes **15.1 s** on this machine while
  `syncContent` takes 0.43 s for all 183 exercises, so the content is not what makes them slow. Run
  alone, `api.test.ts` skips 28 and `sessions.test.ts` skips 9 (no database), while `db.test.ts` (2)
  and `platform.test.ts` (11) pass.
- **Slice boundary:** 16,038 authored changed lines in 34 commits. `T7` (stories 15-20) is next: it
  needs `app.launch-terminal`, `session.detach`/`session.attach` and `window.new`, none of which any
  catalog or the engine models yet, so it starts with the terminal and session actions rather than
  with content.

## Design for T7 (terminals, sessions and the desktop, decided)

Stories 15-20 leave the editor, so three models have to exist before content can name them. All three
follow S6 (nothing faked, nothing refused silently) and the engine's existing rules (pure functions,
total operations, refusals that name what is missing).

**T7a1 — a terminal is a window that shows a session, not a file (story 15, 19).**

- The window tree gains a second leaf: `{ kind: "terminal", terminalId }`. A leaf still shows exactly
  one thing, so focus, swap, resize, zoom and close work on a terminal leaf with no special case.
- A terminal is `{ id, title, cwd, entries }`, where an entry is `{ command, output: string[] }`. The
  _exercise_ declares the outputs (`initialState.terminal.commands: Record<string, string[]>`), because
  a simulated machine has no processes (S6): `shell.run` looks the command up, appends the entry and
  returns the state; a command with no declared output is refused, naming the command and the file that
  declares it, never invented text.
- `app.launch-terminal` opens a terminal leaf beside the focused window, focused. `open_buffers` keeps
  meaning "what is loaded"; `windows` prints a terminal leaf as `terminal:<title>` so a story can assert
  the shape without a second grammar, and the new `terminal_output` goal asserts the lines the focused
  terminal printed (`{ type: "terminal_output", lines: [...] }`, compared as lines like `buffer_text`).

**T7a2 — sessions and workspaces (stories 17, 18, 20).**

- `session.detach` freezes the workspace: every tab, tree, buffer and terminal stays in the state behind
  `detached: true`, and no action applies while detached except `session.attach`, which restores exactly
  what was frozen. That is the whole of "detach, reattach, find the editor still open", and it is
  assertable: `{ type: "session", state: "detached" | "attached" }`.
- `workspace.move` moves the focused window to another tab, as a split of that tab's root, and leaves the
  focus in the tab it came from; `workspace.switch` (already modelled) brings you back. A move that would
  empty the source tab is refused, because a workspace is never nobody's.
- Resize mode is an input mode, not a layout: `window.enter-resize-mode` / `window.leave-resize-mode` set
  `mode: "normal" | "resize"`, and while it is `resize` only the `window.resize-*` actions and leaving it
  apply — everything else is refused with a reason naming the mode. `{ type: "mode", mode: "normal" | "resize" }`
  asserts it, so "widen a window in resize mode, then leave it" ends with `mode: normal` and a wider ratio.

**T7b — content (stories 15-20).** Six skills (`neovim.terminal.launch`, `...terminal.run`,
`...workspace.move`, `...workspace.resize-mode`, `...terminal.panes`, `...session.detach`) and six
stories, with ES overlays, each declaring the outputs its terminal needs. Catalog rows for the keys no
layer declares yet: `session.attach` (tmux `tmux a`) and the resize-mode pair.

## Design for T7a3 and T8 (typing into a terminal, and the view that shows it)

The reconnaissance of `apps/web` found three gaps between the engine and a learner, and one of them is
an engine gap this design closes first.

**T7a3 — a terminal you can type into.** Story 19 says "split a tmux pane, run the tests there", so a
terminal is not a log to read: it is a prompt to write at. The engine already models a `:` command line
(`state.pending`), and a terminal prompt is the same shape, so:

- Printable keys with a terminal focused append to that terminal's own command line
  (`state.terminals[i].pending`), Backspace removes the last character, and `Enter` runs it through the
  same path `shell.run` uses: the declared output is appended as an entry, and a command nobody declared
  is refused with the exact reason `shell.run` gives, keeping what was typed so it can be corrected.
- With a file focused, keys keep going where they go today (the editor). That is `dispatchWorkspace`'s
  existing split, and the terminal's command line is a second face of the same idea.

**T8 — the view.** `PracticeScreen` branches on `kind === "workspace"` and today renders a notice; the
screen owns keyboard capture, the attempt, hints and feedback, and the workspace branch starts no
attempt at all. The view is built in this order:

1. **An attempt that can advance.** `packages/evaluation` cannot record a workspace action:
   `recordInput` throws and `WorkspaceAttempt.actions` is only ever empty. Add
   `recordWorkspaceAction(attempt, action, options)`, which applies the action to the attempt's
   workspace state, appends the action to `actions` (so a replay and a ghost run have something to
   replay) and returns the same refusal shape the other kinds use — a refused action changes nothing.
   Test it where the vim and shell attempts are tested: the same state twice, a refusal that does not
   mutate, and a replay that reaches the objective.
2. **Keys to actions, then to the engine.** At the capture site, resolve the key with
   `packages/keymap`'s resolver over the learner's enabled layers; a resolved key becomes
   `recordWorkspaceAction` with that action (plus the options the layer's row implies), and an
   unresolved key falls through to `dispatchWorkspace`, which is what types into the buffer or the
   terminal prompt. `apps/web` gains the `@tutor-nvim/workspace-engine` dependency; nothing new is
   invented for notation.
3. **The renderer.** A pane is a leaf: the existing `EditorView` for a buffer leaf, a small terminal
   view for a terminal leaf (workspace terminals carry `entries`, not a `shell-engine` transcript, so it
   is a second view, not an adapter), and the split tree is drawn from `splitRatios` with the focused
   leaf ringed, the zoomed leaf marked in words, and mode/pending shown where the vim footer shows them.
   Tailwind only, tokens from `index.css`, no new CSS files, keyboard-only, focus visible, no
   colour-only state (`AGENTS.md` 18-19).
4. **Strings and tests.** New `practice.workspace.*` keys in both `en` and `es` (the parity test fails
   otherwise), and the `workspace-notice` test boundary replaced by a real one: the screen shows the
   panes of the exercise, a key that a layer resolves moves focus, and a key that does not reach the
   buffer types into it.

**L14 — evidence (T7): the twenty stories are told, and three of them say what they cannot prove**

- Landed in four units. `0f4d75c` made a terminal a leaf (`WindowNode = LeafWindow | SplitWindow |
TerminalWindow`), so focus, split, zoom, resize, swap and close needed no special case: they walk
  leaves. `e22e698` added the freeze (`detached`), `workspace.move` with its three refusals, the resize
  mode gate and the refusal to edit while a terminal is focused. `9843137` gave each terminal its own
  command line, run through the one body `shell.run` also calls. `11cec6c` wrote the six skills and the
  six stories with their ES overlays.
- The gate caught what a review would have: `workspace.move` had no catalog row, so story 17 was
  refused rather than shipped soft. The answer was four omarchy rows (`Super-S-1`…`Super-S-4`) recorded
  and not pressable, which is what that layer declares for every `Super-` chord — a shift chord reaches
  a page as the character it produced, so no pressable form exists and claiming one would be a lie.
  `content:ci` is green with 49 skills, 189 exercises and 239 solutions.
- Three stories state their own limit instead of hiding it, and the limit is the same one: an objective
  reads an end state.
  - 19 (run the suite in a pane, then kill it) ends on the shell beside the editor with the scrollback
    asserted; a killed pane has nothing left to read. It works because the engine models a split of a
    terminal as one session shown twice, and the explanation says what real tmux would cost.
  - 20 (detach, reattach) proves the workspace survived the freeze — layout, focus, saved text,
    scrollback — because `detached` is back to false and leaves no other mark.
  - 18 (resize mode) can only be observed as `mode: normal` at the end, so the declared optimal route is
    the one that enters the mode and the objective pairs it with the ratio the steps produced.
- Two behaviours the slice decided and a reader should check rather than assume: a second
  `app.launch-terminal` opens a second session instead of reusing the first, and a zoom that named the
  moved window is dropped by `workspace.move`. Both are tested; neither is inevitable.
- `packages/workspace-engine/README.md` understates the engine again (no detached/mode, no session,
  move, resize-mode or terminal actions). It is stale by three slices now, and it is the one file this
  work has not kept up with; a follow-up unit should rewrite it from the action list the engine exports.

**L15 — evidence (T8): the stories are playable, and what the screen refuses to fake**

- Two units. `61705a8` gave the attempt a step: `recordWorkspaceAction` applies the action, appends it
  with its options and hands back the engine's refusal untouched, so a refused action leaves the
  attempt identical and a recorded run replays to the state it produced — the same
  `engineOptions`/`recordedAction` pair now serves recording and replay, because two conversions of one
  concept is how a replay starts disagreeing with a screen. `5d538b0` put the view in: panes from
  `splitRatios`, `EditorView` for a buffer leaf, a scrollback plus prompt for a terminal leaf, the
  focused pane ringed and named, zoom/mode/session spelled out, and keys resolved through
  `packages/keymap` over the learner's enabled layers with everything else falling through to
  `dispatchWorkspace`. The chrome three kinds share (frame, hints, result, hint clock) was extracted
  into `PracticeFrame`/`PracticeHints`/`PracticeResult`/`usePracticeScreen`, and the vim and shell
  practice tests stayed green through it.
- **Packaging was the real blocker**, not the code: `apps/web` declared the engine but the lockfile had
  no importer entry, so a `--frozen-lockfile` install — what Vercel runs — would have failed while a
  local build passed. `pnpm install --no-frozen-lockfile` wrote exactly three lines and nothing else
  moved; the temporary relative re-export became a bare specifier afterwards.
- Four limits the screen states rather than hides: the layer rail cannot name who owns a key in a
  workspace attempt, because an attempt records actions and `events` stays empty by design; the
  terminal component test drives `Super-Enter` through the omarchy layer even though that catalog
  records the chord as unpressed by a page; an objective is checked after every step, so content whose
  initial state already met its objective would end on the first key (none does); and `recordInput`
  still throws for this kind, which the new tests pin so nobody reaches for it by accident.
- A bug review found on the way, fixed separately: the detached/resize gate stood in front of actions
  and the terminal prompt but not in front of the editor, so a frozen workspace still answered `x`
  (`db437b4`, test first). The engine README was rewritten from the code in `70927c3`, which is what
  surfaced it.
- Known red after this slice, all pre-existing or owned by T9: `packages/shell-engine`'s oracle against
  this host's bash and coreutils (42); the curriculum coverage gates demanding five exercises per skill
  (the twenty stories exist, five per skill do not); `tests/gamification-sync.test.ts` because the API
  cannot replay a workspace attempt yet (T9); and the DB-backed API files, whose ten-second hook is
  beaten by `openTestDb` taking 15.1 s on this machine while `syncContent` takes 0.43 s.
