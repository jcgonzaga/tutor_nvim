# Tutor NeoVim

Web-first, gamified trainer for Linux basics, Vim/Neovim and (later) LazyVim.
Source of truth: [`docs/PRD.md`](docs/PRD.md), [`AGENTS.md`](AGENTS.md),
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

Current state: **Milestone 5** (local product MVP: onboarding, calibration, daily session, skill
map, local progress) on top of the pedagogy engine (M4), the exercise platform (M3), the Vim core
(M2) and the first practice slice (M1):
[`m1-vertical-slice`](docs/architecture/m1-vertical-slice.md),
[`m2-vim-core`](docs/architecture/m2-vim-core.md),
[`m3-exercise-platform`](docs/architecture/m3-exercise-platform.md),
[`m4-pedagogy-engine`](docs/architecture/m4-pedagogy-engine.md),
[`m5-local-product`](docs/architecture/m5-local-product.md).

## Commands

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev               # app at http://localhost:5173 (onboarding on first visit)
pnpm typecheck
pnpm lint
pnpm test              # unit + integration (Vitest)
pnpm content:validate  # schemas + cross-references for content/skills and content/exercises
pnpm content:test      # also run every declared solution through the Vim engine
pnpm vim:oracle        # regenerate Vim oracle fixtures (needs vim + python3)
pnpm test:e2e          # Playwright (starts the dev server itself)
pnpm build
```

The app starts with onboarding, then the daily home. Progress is stored in this browser only
(`localStorage`); no account is needed. Use `?exercise=<slug>` for free practice on a specific
exercise (not recorded), e.g. `/?exercise=vim.ci-quotes.basic-001`.

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
