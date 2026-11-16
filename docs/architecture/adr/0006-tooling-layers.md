# ADR-0006: Tooling layers — exercises speak actions, keymaps resolve keys (post-MVP phase)

Status: accepted (product owner, scope expanded 2025-11); planning record for
[M12](m12-tooling-layers-and-workspace.md). Nothing in this ADR is implemented yet.

## Context

Today two engines exist and each one owns a single surface:

- `packages/vim-engine`: one buffer, one window, NORMAL and INSERT.
- `packages/shell-engine`: one shell over an in-memory file system, one working directory.

An exercise declares `environment: { type: simulator, profile: shell-basic-v1 }` and its goal is text
(buffer, file tree, last output). That teaches a command in isolation, which is what the MVP needed.
Real development is *compositional*: the same physical key press means different things depending on
which tool owns it — a leader chord in LazyVim, a prefix in tmux, a `Super` chord in the window
manager, a readline binding in the shell. A learner who knows `dd` but not how to get back to the
file they were editing has not transferred the skill.

The owner asked for three things this ADR and M12 have to serve:

1. retrying an exercise the learner cannot solve (delivered separately, feature 1);
2. keybindings from Linux, nvim, LazyVim, Herdr, tmux and Omarchy, enabled one, several or all;
3. the usual developer workflows: pick a file, edit it, pick another, move between them, and open,
   close and resize windows.

The contract of AGENTS.md 2.5 (deterministic evaluation), 2.3 (framework-free engines), 2.8 (multiple
valid strategies) and 2.10 (low latency) all have to survive the expansion.

## Decision 1: an objective judges the *state*, never a keystroke string

An exercise keeps declaring an end state, now over a workspace: which file is active, what is open in
which window, where the focus is, how the windows are laid out, what each buffer contains. The
keystrokes are evidence and cost, not the answer.

This is the same rule the Vim side already follows: `ci"` is *a* way to reach the target buffer, and
`x`-repeated is another one that classifies worse. Extending it to windows means "split a pane
horizontally" is solved by whichever tool the learner has enabled.

## Decision 2: a `KeymapLayer` resolves keys to actions, and learners choose layers

```ts
type Action =
  | "file.open" | "file.find" | "grep.project" | "buffer.next" | "buffer.previous"
  | "buffer.close" | "file.save" | "window.split-side-by-side" | "window.split-stacked"
  | "window.close" | "window.focus-left" | "window.resize-wider" | "pane.zoom"
  | "session.detach" | "session.attach" | "workspace.switch-1" | ... ;
```

A layer is content, not code:

```yaml
# content/keymaps/tmux.yaml
schemaVersion: 1
id: tmux
label: "tmux"
owns: multiplexer
prefix: "C-b"
bindings:
  - keys: "%"
    action: window.split-side-by-side
    description: "Split the current pane side by side."
  - keys: "\""
    action: window.split-stacked
  - keys: "z"
    action: pane.zoom
  - keys: "d"
    action: session.detach
```

- Layers: `linux` (shell + readline), `nvim` (core commands; the current engine), `lazyvim`
  (leader mappings on top of `nvim`), `tmux` (prefix), `herdr` (its own catalog), `omarchy`
  (Super chords on Hyprland).
- `lazyvim` and `herdr` **extend** another layer, so enabling them does not mean re-learning the base.
- The learner enables one, several or all of them in settings. An exercise declares the layers it
  needs, and it stays available only while they are enabled.
- Content that is tool-agnostic asks for the action, so one exercise is solved by `tmux` keys or by
  Herdr keys or by mouse-free Omarchy chords — the same way 2.8 already treats several Vim
  sequences as valid.

## Decision 3: composition is simulated, layered and deterministic

```text
window manager (omarchy: Super chords, workspaces)
└── terminal windows
    └── tmux session (prefix C-b): panes, tabs, detach
        └── nvim (nvim + lazyvim layers): buffers, splits, leader
            └── shell inside the pane (linux layer): commands, readline
```

One pure engine (`packages/workspace-engine`) holds the tree, the focus path and the layout. Keys enter
at the focused leaf and bubble outward only when the leaf does not consume them — which is exactly the
confusion the product exists to remove. No real containers, no server-side Neovim, no real tmux or
Hyprland: AGENTS.md 2.5 and the MVP exclusion of containers stay in force.

## Alternatives rejected

- **Record literal keystrokes per tool.** Six layers × N exercises: content explodes, and the same
  skill would need a copy per tool, which destroys transfer (2.8).
- **Real containers, real Neovim, real tmux.** Non-deterministic, server-side, needs a security
  review (AGENTS.md 3, plan P3) and breaks the keypress budget (2.10).
- **One simulator per tool** (a "tmux engine", an "omarchy engine"). The interesting behaviour is the
  interaction between layers; separate engines cannot express focus bubbling or key capture order.

## Consequences

- New package `packages/workspace-engine` with its own oracle tests, in the spirit of the Vim and bash
  oracles: recorded real behaviour for the tmux and nvim binding catalogs, unit tests where no oracle
  exists.
- `packages/exercise-schema` gains `environment.layers`, workspace objectives and action-based
  solutions; every declared solution must still be replayed by the engine in CI (AGENTS.md 10).
- Content gains `content/keymaps/*.yaml`; the six catalogs must come from each tool's own
  documentation. Herdr is the least documented of the six and is the first research task, not a
  guess.
- The practice UI gains an environment indicator (which layer will read the next key) and a layout
  view for windows and panes.
- Mastery, review scheduling, XP, sessions and the API replay discipline are untouched.
