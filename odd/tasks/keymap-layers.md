# Keymap layers — choose which tool owns the keys (Linux, nvim, LazyVim, Herdr, tmux, Omarchy)

Feature 2 of 3 requested by the owner. Status: **in progress** (T1, T1b, T1c, T2, T3, T4 done; T5 next). Design: [ADR-0006](../../docs/architecture/adr/0006-tooling-layers.md),
[M12](../../docs/architecture/m12-tooling-layers-and-workspace.md).

## Specs

**S1** — "se tiene que poder elegir si el sistema ejecuta comandos y keybindings de Linux, nvim,
Lazyvim, Herdr, Tmux, Omarchy, uno, varios o todos." The learner enables one, several or all layers;
the choice is theirs, persisted, and it survives a reload.

**S2** — A layer is declarative content (`content/keymaps/<id>.yaml`), validated by the schema before
it reaches the app: id, label, the surface it owns, an optional prefix or leader, and bindings of
`keys` → `action` with a description.

**S3** — The six catalogs are `linux`, `nvim`, `lazyvim`, `tmux`, `herdr`, `omarchy`. `lazyvim` and
`herdr` declare `extends`, so enabling them adds to a base instead of replacing it. A binding that
cannot be verified against the tool's own documentation is left out, not invented. (Amended by L4:
`herdr` is a multiplexer of its own and extends nothing.)

**S4** — An exercise declares `environment.layers`. It stays available only while every layer it
needs is enabled; disabling a layer hides its exercises instead of failing them.

**S5** — Keys are resolved by the enabled layers in capture order: the focused surface first, then
outward. A key sequence no enabled layer claims is reported as not accepted, and the UI says which
layer owns the next key.

**S6** — An exercise asks for an action and an end state, so the keys of any enabled layer that
provides the action solve it (tmux `%` or Herdr's own split binding), and the strategy classification
compares what the keys cost.

**S7** — Layer catalogs and their exercises are content: adding a seventh tool later means adding a
YAML file and its exercises, not a new engine.

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S2, S3 | schema + validation, `content/keymaps/linux.yaml` | 6b5c33d |
| T1c | S3 | vocabulary v2: layout-named splits, `motion.*`/`edit.*`, binding `target` | f860f89 |
| T1b | S3 | `nvim`, `tmux`, `tmux-omarchy`, `omarchy` catalogs from sourced research | 184c01e |
| T2 | S3 | research Herdr's own documentation, then its catalog; `lazyvim` leader catalog | pending commit |
| T3 | S1, S4 | `environment.layers`, `isExerciseAvailable`/`availableExercises`, `prefs.enabledLayers` + `withLayer` | pending commit |
| T4 | S5 | `packages/keymap`: capture order, prefix/leader openers, inheritance and overrides, `pending`/`action`/`not-accepted` outcomes | pending commit |
| T5 | S6 | action-based solutions in `packages/exercise-schema` + evaluation | pending |
| T6 | S1, S5 | settings UI (one / several / all) and the "next key belongs to" indicator | pending |
| T7 | S1-S7 | CI: every catalog binding resolves; every declared solution replays | pending |

## Frozen schema for T1 (keymap layer v1)

This is the interface T1 implements and later tasks consume. Decided here, not by the implementer.

```yaml
schemaVersion: 1              # required, literal 1
id: tmux                      # stable public id, ^[a-z][a-z0-9-]*$, unique across files
label: "tmux"                 # learner-facing name, non-empty
owns: [multiplexer]           # non-empty, unique, from SURFACES
extends: []                   # optional layer ids this one builds on (no cycles)
prefix: "C-b"                 # optional: the key(s) that open this layer's command group
leader: " "                   # optional: the leader this layer's bindings are written after
bindings:                     # required, non-empty
  - keys: "%"                  # required: what is pressed AFTER prefix/leader, when the layer has one
    action: window.split-horizontal   # required, from ACTIONS
    description: "Split the pane side by side."   # required, one line, learner-facing
    modes: [normal]            # optional subset of MODES; empty means any mode
    override: false            # optional; must be true to replace an inherited (keys, modes) pair
    notModelled: "needs a running tmux server"     # optional; why this binding cannot be exercised yet
```

- `SURFACES` = `shell`, `editor`, `multiplexer`, `window-manager`.
- `MODES` = `normal`, `insert`, `visual`, `resize`, `copy-mode`.
- `ACTIONS` (v1, closed set, kebab-case within a dotted namespace): `file.open`, `file.find`,
  `file.save`, `file.new`, `file.close-buffer`, `buffer.next`, `buffer.previous`, `buffer.list`,
  `grep.project`, `window.split-horizontal`, `window.split-vertical`, `window.close`,
  `window.focus-left`, `window.focus-right`, `window.focus-up`, `window.focus-down`,
  `window.resize-wider`, `window.resize-narrower`, `window.resize-taller`,
  `window.resize-shorter`, `window.zoom`, `window.swap`, `window.new`, `app.launch-terminal`,
  `workspace.switch`, `session.detach`, `session.attach`, `tab.new`, `tab.next`, `tab.previous`,
  `shell.clear-line`, `shell.history-search`, `shell.complete`.
- Key notation: a single printable character as-is (`%`, `"`, `z`), or `+`-joined modifiers `C-`,
  `S-`, `M-`, `Super-`, or one named key (`Enter`, `Esc`, `Left`…`Down`, `Space`). When a layer
  declares `leader`, its bindings are written after the leader (`ff` means `<leader>ff`).

Validation must reject: `schemaVersion` other than 1; a malformed or duplicate `id`; unknown surface,
modes or action; empty `label`, `bindings` or `description`; keys that do not match the notation;
`extends` pointing at an unknown layer or forming a cycle; and a binding that repeats an inherited
`(keys, modes)` pair without `override: true`.

Scope of T1: the schema, the parser and its validation, wired into the existing content CI so the
catalogs cannot rot, plus the `linux` catalog. Wiring layers into `loadContent`, the web app and the
API is T3/T4, and the remaining catalogs are T1b and T2.

## Vocabulary v2 (decided after the sourced research; supersedes v1 where they differ)

The research for T1b found two contradictions that a catalog writer cannot resolve alone. Decided here:

**1. Split actions are named by the resulting layout, not by the word "horizontal".** Tools disagree:
tmux `%` (`split-window -h`) leaves panes side by side, while Neovim's `:split` splits *horizontally*
and stacks windows. One name cannot carry both:

- `window.split-side-by-side` replaces `window.split-horizontal` (tmux `%`, nvim `C-wv`).
- `window.split-stacked` replaces `window.split-vertical` (tmux `"`, nvim `C-ws`).

**2. The `nvim` layer is inexpressible in v1**, because `KEYMAP_ACTIONS` had no motion or edit verbs
while the engine models exactly those. Added, covering only what `packages/vim-engine` already does:

| Namespace | Actions |
| --- | --- |
| `motion.` | `char-left`, `char-right`, `char-up`, `char-down`, `word-forward`, `word-backward`, `word-end`, `word-forward-big`, `word-backward-big`, `word-end-big`, `line-start`, `line-first-non-blank`, `line-end`, `find-char`, `find-char-backward`, `repeat-find`, `repeat-find-reverse` |
| `edit.` | `insert-before`, `insert-after`, `open-line-below`, `normal-mode`, `delete`, `change`, `yank`, `delete-char`, `put-after`, `put-before`, `undo`, `redo`, `repeat` |

**3. A binding may carry an optional `target`**, so text objects do not explode the vocabulary:
`target` ∈ `char`, `line`, `word`, `inner-word`, `inner-quotes`, `inner-parens`, `inner-braces`,
`around-quotes`, `around-parens`, `around-braces`. `target` is allowed only for `edit.delete`,
`edit.change` and `edit.yank`; anywhere else it is a validation error. Example:

```yaml
  - keys: 'ci"'
    action: edit.change
    target: inner-quotes
    description: "Change the text inside the double quotes."
```

**4. Omarchy ships its own tmux configuration** (prefix `Ctrl-Space`, splits on `v`/`h`), so tmux
*defaults* are factually wrong on the machine the `omarchy` layer models. Two layers, not one:
`tmux` (upstream defaults, prefix `C-b`) and `tmux-omarchy` (`extends: [tmux]`, prefix `C-Space`,
overrides only what Omarchy changes).

**5. Accept two notation gaps instead of faking them.** Omarchy has no resize submap and its resize
chords are bound to physical key codes (`code:20`/`code:21`), which change character with the layout
(AGENTS.md 2.9); the `keys` notation has no key-code form. Those bindings stay out of the catalog and
are recorded here as a notation task, not modelled with a wrong character.

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

- `content/exercises/*.yaml` declare `environment: { type: simulator, profile: shell-basic-v1 }`: a
  label, not a composition.
- `packages/vim-engine` and `packages/shell-engine` each own one surface; no layer, prefix or leader
  concept exists anywhere in the code base.
- Content covers Linux commands and core Vim only; there is no LazyVim, tmux, Herdr or Omarchy
  content, and no per-tool keymap catalog.

**L4 — evidence and decision (T2)**

- Herdr's own keyboard guide (<https://herdr.dev/tui/docs/keyboard/>) shows a standalone multiplexer
  that shares tmux's default prefix `ctrl+b` but not its keys (splits `v` / `minus`, focus `h/j/k/l`,
  detach `q`). Making `herdr` extend `tmux` would inherit `%` and `"`, bindings Herdr does not have,
  which S3 forbids. Decision: `herdr` declares no `extends`; S3 amended accordingly. `lazyvim` keeps
  `extends: [nvim]` with `leader: "Space"`.
- Gaps handed to T4: a leader layer cannot hold direct keys (LazyVim `S-h`, `C-s`), and the
  inherited-pair check compares raw keys without the leader (`<leader>,` vs nvim `,`). Details in
  `keymap-catalogs-research.md`.
- `herdr` and `tmux` both own `multiplexer` with prefix `C-b`; enabling both is a conflict T3/T4 must
  resolve (S5), not a catalog error.

**L5 — evidence and decision (T3)**

- `environment.layers` is part of the shared `environmentSchema` (`packages/exercise-schema/src/primitives.ts`),
  so the Vim and shell exercises declare it the same way; it defaults to `[]`, which keeps the
  existing 168 exercises available whatever is enabled. Both defaults now carry `layers: []`, and the
  two assertions that compared the whole environment were updated instead of loosened.
- The filter is domain code, not React: `isExerciseAvailable` requires *every* declared layer,
  `availableExercises` keeps the order. `prefs.enabledLayers` stores the choice and `withLayer` toggles
  one id idempotently, so the object identity React sees does not change when nothing changed.
- Applying the filter at the practice entry points (free practice, session builder) ships with T6: it is
  the screen that can change the set, and no existing exercise declares a layer yet, so wiring it today
  would be unreachable code with no observable behaviour.

**L6 — design decisions (T4)**

- Resolution lives in a new domain package, `packages/keymap` (no React, no storage), because
  `packages/exercise-schema` owns schemas and validation, not behaviour. The caller passes the enabled
  layers already in capture order, so the resolver never reads prefs.
- **A prefix is global to its surface; a leader is local to the layer that declares it.** Omarchy ships
  tmux with `C-Space`, so an inherited tmux binding must open with `C-Space` on that machine; Neovim's
  `h` must stay one key inside LazyVim. Decided from behaviour, recorded here because it looks
  asymmetric until you know why. This closes the L4 gap "a leader layer cannot hold direct keys":
  inherited bindings keep the opener they were written with.
- Ties (two enabled layers owning the same surface, tmux and Herdr both on `C-b`) resolve in the order
  the learner enabled them; the outcome still names the layer, so the UI can show the owner. Enabling
  both is allowed and documented, not a content error.
- `not-accepted` carries the key and a reset state; a pending sequence that a key breaks closes
  instead of guessing (S5). Modes filter candidates (`modes: []` means any mode).
- Wiring the resolver into the practice screen, the notation bridge (keymap notation to `KeyInput` to
  `KeyInput`) and the "next key belongs to" indicator ship with T6, for the same reason as T3.
