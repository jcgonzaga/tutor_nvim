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
| T1 | S4 | `packages/workspace-engine`: file tree + buffers + focus, oracle tests | pending |
| T2 | S2, S4 | window tree, splits, resize, zoom, swap, workspaces | pending |
| T3 | S1, S2 | schema objectives: `active_file`, `buffers`, `layout`, `focus`, `buffer_text` | pending |
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
