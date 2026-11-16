# Keymap layers — choose which tool owns the keys (Linux, nvim, LazyVim, Herdr, tmux, Omarchy)

Feature 2 of 3 requested by the owner. Status: **planned** (specs and tasks frozen; implementation not
started). Design: [ADR-0006](../../docs/architecture/adr/0006-tooling-layers.md),
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
cannot be verified against the tool's own documentation is left out, not invented.

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
| T1 | S2, S3 | schema + validation, `content/keymaps/*.yaml` for `linux`, `nvim`, `tmux`, `omarchy` | pending |
| T2 | S3 | research Herdr's own documentation, then its catalog; `lazyvim` leader catalog | pending |
| T3 | S1, S4 | prefs: the enabled layer set; content filtering by exercise requirements | pending |
| T4 | S5 | key resolution across layers with `pending` prefix state; "not accepted" report | pending |
| T5 | S6 | action-based solutions in `packages/exercise-schema` + evaluation | pending |
| T6 | S1, S5 | settings UI (one / several / all) and the "next key belongs to" indicator | pending |
| T7 | S1-S7 | CI: every catalog binding resolves; every declared solution replays | pending |

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
