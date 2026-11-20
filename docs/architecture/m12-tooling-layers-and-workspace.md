# M12 — Tooling layers and the workspace (post-MVP phase)

Status: **planned**, not implemented. Design record:
[ADR-0006](adr/0006-tooling-layers.md). Owner decision: the MVP exclusions in AGENTS.md 3 stay in
force for the MVP, and this phase is the next one — still simulated, never containers or a
server-side Neovim.

## Why

The MVP teaches one command at a time on one surface. A developer's day is a chain of transitions
between surfaces: find the file, edit it, switch to the file you were in, split the window, resize it,
run the tests in another pane, come back, detach, reattach. The tool that owns the next key press
changes at every step (nvim → LazyVim leader → tmux prefix → the window manager's `Super` chord →
the shell's readline). The product's job is to make that ownership obvious and fluent.

## The model

```text
window manager (omarchy)   Super+Return, Super+Q, workspaces, resize mode
└── terminal window
    └── tmux session       prefix C-b: panes, tabs, detach
        └── nvim           buffers, splits, saves (nvim layer)
            │              leader mappings (lazyvim layer, extends nvim)
            └── shell      commands + readline (linux layer)
```

`packages/workspace-engine` holds the whole tree as immutable state:

```ts
interface WorkspaceState {
  readonly fs: FileTree; // shared with the shell engine's model
  readonly buffers: readonly Buffer[]; // nvim buffers: path + text + cursor + modified
  readonly windows: WindowTree; // splits, panes, tabs, workspaces: a tree, not a list
  readonly focus: FocusPath; // which leaf owns the next key
  readonly layers: readonly LayerId[]; // what the learner enabled
  readonly pending: PendingKeys; // leader or prefix partly typed
}
```

Keys enter at the focused leaf and bubble outward only when the leaf does not claim them. Everything is
pure: `(state, key) -> state`, no clock, no I/O, no globals (AGENTS.md 2.3), so `initial state + keys =
final state` is testable without a browser.

## Phases

| Phase     | Scope                                                                                                                                                                         | Done when                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **M12-A** | `packages/workspace-engine`: file tree, buffers, window tree, focus path, resize, layout invariants                                                                           | unit tests for layout/focus; an oracle test against real tmux + nvim keystroke transcripts for the modelled subset         |
| **M12-B** | `content/keymaps/*.yaml` + schema: six catalogs (`linux`, `nvim`, `lazyvim`, `tmux`, `herdr`, `omarchy`), prefix/leader handling, `extends`                                   | every catalog validates; a key resolves to exactly one action per enabled set; unresolvable keys are reported, not guessed |
| **M12-C** | Schema + evaluation: `environment.layers`, workspace objectives (`active_file`, `buffers`, `layout`, `focus`, `buffer_text`), action-based solutions, strategy classification | every declared solution is replayed by the engine in CI (AGENTS.md 10); one objective is solved with two different layers  |
| **M12-D** | Content: the 20 developer stories of the catalog below as skills and exercises with prerequisites                                                                             | each story is solvable in the simulated workspace; transfer tags per story                                                 |
| **M12-E** | Web: layer selection in settings (one, several, all), workspace view (tiling layout, focus ring), an indicator of which layer owns the next key                               | keyboard-only, reduced motion, no color-only status (AGENTS.md 19)                                                         |
| **M12-F** | API replay of workspace attempts with the same engine                                                                                                                         | the server recomputes the same outcome; no client score is read                                                            |

## The developer stories (M12-D)

Derived from what developers actually do, in three clusters. Each one becomes a skill with exercises;
the keymap layer decides the keys, the objective decides the end state.

**Files and buffers** — the transition cluster:

1. Open a project file by name, edit it, and save it.
2. Find a file by fuzzy name without leaving the editor.
3. Grep the project for a symbol, jump to the match, edit there.
4. Jump back to the file you were just editing.
5. List the open buffers and pick one.
6. Create a new file, write it, save it.
7. Close a buffer without quitting the editor.
8. Rename a file from the shell and reopen it from the editor.

**Windows and panes** — the layout cluster:

9. Split the editor vertically and show two different files side by side.
10. Move the cursor to the other window without a mouse.
11. Resize the split.
12. Close one split and keep the other.
13. Zoom a pane to full screen, then restore it.
14. Swap two windows.

**Sessions and the desktop** — the surrounding cluster:

15. Open a new terminal window and move focus to it.
16. Close the focused window and get focus back to the remaining one.
17. Move a window to another workspace and come back to it.
18. Widen a window with the resize mode, then leave resize mode.
19. Split a tmux pane, run the test command there, switch back to the editor pane, kill the pane.
20. Detach the tmux session, reattach it, and find the editor still open with its buffers.

## Risks

- **Herdr's catalog is the least documented of the six.** Its bindings must come from its own
  documentation; anything unverifiable stays out of the catalog instead of being invented. First task
  of M12-B.
- **Capture-order ambiguity** (two enabled layers claiming the same prefix) is a product problem, not
  a bug: the UI must say which layer owns the next key, and the catalog must make conflicts explicit.
- **Review workload**: M12 is larger than any MVP milestone. It ships as separate work units per phase,
  never as one change set.

## Out of scope, unchanged

Real containers, a server-side Neovim, LSP/Mason/Treesitter/Lazygit, real processes, networking.
