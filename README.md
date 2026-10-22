# Tutor NeoVim

Web-first, gamified trainer for Linux basics, Vim/Neovim and (later) LazyVim.
Source of truth: [`docs/PRD.md`](docs/PRD.md), [`AGENTS.md`](AGENTS.md),
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

Current state: **Milestone 10** (a Linux shell simulator: 8 skills, 48 exercises, mixed with Vim) on top of
**Milestone 9** (release hardening: CI gates, monitoring, accessibility, performance
budgets, opt-in analytics, deployment) on top of **Milestone 8** (XP, combo, streak, ghost comparison, replay) on top of **Milestone 7** (MVP content: 21 skills, 120 exercises) on top of **Milestone 6** (optional cloud persistence: Fastify API, Neon Postgres via Drizzle,
Neon Auth) on top of **Milestone 5** (local product MVP: onboarding, calibration, daily session, skill
map, local progress) on top of the pedagogy engine (M4), the exercise platform (M3), the Vim core
(M2) and the first practice slice (M1):
[`m1-vertical-slice`](docs/architecture/m1-vertical-slice.md),
[`m2-vim-core`](docs/architecture/m2-vim-core.md),
[`m3-exercise-platform`](docs/architecture/m3-exercise-platform.md),
[`m4-pedagogy-engine`](docs/architecture/m4-pedagogy-engine.md),
[`m5-local-product`](docs/architecture/m5-local-product.md),
[`m6-cloud-persistence`](docs/architecture/m6-cloud-persistence.md) (+ [ADRs](docs/architecture/adr)),
[`m7-content`](docs/architecture/m7-content.md),
[`m8-gamification`](docs/architecture/m8-gamification.md),
[`m9-hardening`](docs/architecture/m9-hardening.md) (+ [deployment](docs/deployment.md)),
[`m10-linux-simulator`](docs/architecture/m10-linux-simulator.md) (shell exercises mixed into the daily session),
[`m11-language-and-teaching`](docs/architecture/m11-language-and-teaching.md) (Spanish by default, theory cards, explanations),
[`visual-design`](docs/architecture/visual-design.md).

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
pnpm --filter @tutor-nvim/api dev   # API (in-process Postgres unless DATABASE_URL is set)
pnpm content:ci        # the content gate CI runs (validate + execute solutions)
pnpm test:e2e          # Playwright (starts the web app and the API itself)
pnpm test:perf         # performance budgets on the production build
pnpm build
```

The app starts with onboarding, then the daily home. Progress is stored in this browser only
(`localStorage`); no account is needed. Use `?exercise=<slug>` for free practice on a specific
exercise (not recorded), e.g. `/?exercise=vim.ci-quotes.basic-001`.

## Layout

| Path                       | Responsibility                                        |
| -------------------------- | ----------------------------------------------------- |
| `packages/vim-engine`      | Framework-free Vim simulator: `(state, key) -> state` |
| `packages/exercise-schema` | Zod schemas, YAML parsing, normalization, validation  |
| `packages/evaluation`      | Attempt telemetry, goal check, strategy, metrics      |
| `packages/shell-engine`    | Framework-free Linux shell simulator (virtual files)  |
| `packages/pedagogy`        | Mastery, unlocks, review scheduler, daily sessions    |
| `apps/web`                 | React UI: renders state, captures keyboard            |
| `apps/api`                 | Fastify + Drizzle API: auth, attempts, progress       |
| `packages/shared`          | Zod schemas shared by web and API                     |
| `content/exercises`        | Declarative exercises (YAML)                          |
| `packages/ui`              | Reserved for later milestones (empty)                 |
