# Tutor NeoVim

Web-first, gamified trainer for Linux basics, Vim/Neovim and (later) LazyVim.
Source of truth: [`docs/PRD.md`](docs/PRD.md), [`AGENTS.md`](AGENTS.md),
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

Current state: **Milestone 4** (pedagogy engine) on top of the exercise platform (M3), the Vim
core (M2) and the first practice slice (M1):
[`m1-vertical-slice`](docs/architecture/m1-vertical-slice.md),
[`m2-vim-core`](docs/architecture/m2-vim-core.md),
[`m3-exercise-platform`](docs/architecture/m3-exercise-platform.md),
[`m4-pedagogy-engine`](docs/architecture/m4-pedagogy-engine.md).

## Commands

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev               # practice screen at http://localhost:5173
pnpm typecheck
pnpm lint
pnpm test              # unit + integration (Vitest)
pnpm content:validate  # schemas + cross-references for content/skills and content/exercises
pnpm content:test      # also run every declared solution through the Vim engine
pnpm vim:oracle        # regenerate Vim oracle fixtures (needs vim + python3)
pnpm test:e2e          # Playwright (starts the dev server itself)
pnpm build
```

Use `?exercise=<slug>` to open a specific exercise, e.g.
`/?exercise=vim.ci-quotes.basic-001`. Without it the first exercise opens, and "Next exercise"
walks through the rest.

## Layout

| Path                               | Responsibility                                        |
| ---------------------------------- | ----------------------------------------------------- |
| `packages/vim-engine`              | Framework-free Vim simulator: `(state, key) -> state` |
| `packages/exercise-schema`         | Zod schemas, YAML parsing, normalization, validation  |
| `packages/evaluation`              | Attempt telemetry, goal check, strategy, metrics      |
| `packages/pedagogy`                | Mastery, unlocks, review scheduler, daily sessions    |
| `apps/web`                         | React UI: renders state, captures keyboard            |
| `content/exercises`                | Declarative exercises (YAML)                          |
| `packages/{shared,ui}`, `apps/api` | Reserved for later milestones (empty)                 |
