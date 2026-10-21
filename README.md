# Tutor NeoVim

Web-first, gamified trainer for Linux basics, Vim/Neovim and (later) LazyVim.
Source of truth: [`docs/PRD.md`](docs/PRD.md), [`AGENTS.md`](AGENTS.md),
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

Current state: **Milestone 2** (Vim core) on top of the **Milestone 1** practice slice — see
[`docs/architecture/m1-vertical-slice.md`](docs/architecture/m1-vertical-slice.md) and
[`docs/architecture/m2-vim-core.md`](docs/architecture/m2-vim-core.md).

## Commands

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev               # practice screen at http://localhost:5173
pnpm typecheck
pnpm lint
pnpm test              # unit + integration (Vitest)
pnpm content:validate  # schema-validate content/exercises/*.yaml
pnpm vim:oracle        # regenerate Vim oracle fixtures (needs vim + python3)
pnpm test:e2e          # Playwright (starts the dev server itself)
pnpm build
```

Use `?exercise=<slug>` to open a specific exercise, e.g.
`/?exercise=vim.ci-quotes.basic-001`.

## Layout

| Path                                        | Responsibility                                        |
| ------------------------------------------- | ----------------------------------------------------- |
| `packages/vim-engine`                       | Framework-free Vim simulator: `(state, key) -> state` |
| `packages/exercise-schema`                  | Zod schemas, YAML parsing, normalization, validation  |
| `packages/evaluation`                       | Attempt telemetry, goal check, strategy, metrics      |
| `apps/web`                                  | React UI: renders state, captures keyboard            |
| `content/exercises`                         | Declarative exercises (YAML)                          |
| `packages/{pedagogy,shared,ui}`, `apps/api` | Reserved for later milestones (empty)                 |
