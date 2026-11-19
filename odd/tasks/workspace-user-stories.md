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

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S4 | `packages/workspace-engine`: files, buffers, active buffer, `:` command line, oracle tests | pending commit |
| T2 | S2, S4 | window tree, splits, resize, zoom, swap, tabs and workspaces as actions | pending commit |
| T3 | S1, S2 | `kind: workspace` + objectives (`active_file`, `open_buffers`, `buffer_text`, `file_text`, `layout`, `focus`, `split_ratio`, `all`) + `evaluateWorkspaceObjective` | pending commit |
| T4 | S5 | evaluation: action solutions, strategy classification, CI replay | pending |
| T5 | S3 | content: stories 1-8 (files and buffers) | pending |
| T6 | S3 | content: stories 9-14 (windows and panes) | pending |
| T7 | S3 | content: stories 15-20 (sessions and the desktop) | pending |
| T8 | S7 | web: workspace view, layout rendering, focus ring, keyboard only | pending |
| T9 | S4-S6 | API: replay of workspace attempts with the same engine | pending |

## Log

**L1 — original request (verbatim)**

> Revisa el proyecto y quiero hacer modificaciones:
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
and the exercise could only be wrong. What the workspace owns is everything *around* the buffer: the
files on disk, which buffers are open, which one is active, and (from T2) where they are shown.

```ts
interface WorkspaceState {
  readonly files: Readonly<Record<string, string>>;   // path -> text, the simulated disk
  readonly cwd: string;                               // where a shell command would run
  readonly buffers: readonly WorkspaceBuffer[];       // open buffers, in the order they were opened
  readonly activeBufferId: string;                    // never empty: opening one creates it
  readonly pending: PendingWorkspaceCommand | null;   // a half-typed `:e ` or `<C-w>`
}
interface WorkspaceBuffer {
  readonly id: string;          // stable, derived from the path: "buf:src/main.ts"
  readonly path: string;        // path on the simulated disk
  readonly editor: VimState;    // the text, cursor, mode and undo of that buffer
  readonly modified: boolean;   // true when the buffer differs from the file
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
  keys the workspace owns (`:`) are intercepted *before* the editor sees them; everything else
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
  | { kind: "split"; layout: "side-by-side" | "stacked"; ratio: number; first: WindowNode; second: WindowNode };
interface WorkspaceTab { readonly id: string; readonly root: WindowNode; readonly focus: readonly ("first" | "second")[] }
```

- `ratio` is a number in `[0.1, 0.9]`: the engine models *what changed*, never pixels, so a resize is a
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
  focused buffer in *both* panes, which is what tmux and nvim do and what stories 9-10 need. The
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
  - actions: [file.find, file.open, window.split-side-by-side]   # actions, never keys (S5)
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
