# ADR-0002 — Database access: Drizzle ORM, Fastify, in-process Postgres for tests

Status: accepted (M6, T-601). Decided by the project owner (ORM); the rest follows PRD 44.

## Decision

- **Drizzle ORM** with `drizzle-kit` migrations. The schema is TypeScript, the migrations are plain
  SQL checked into `apps/api/drizzle/`, and `drizzle-orm` stays thin enough that the SQL is
  readable (AGENTS 24: migrations only, never manual schema changes; no learning logic in SQL).
- **Fastify** + **Zod** for the API (PRD 44, IMPLEMENTATION_PLAN T-003). Every request body and
  query is parsed with a Zod schema from `@tutor-nvim/shared`.
- **Driver**: `pg` against Neon in production; **PGlite** (real Postgres compiled to WASM, in
  process) for tests and for running the API with no database. Services depend on a driver-neutral
  `Db` type, so the same migrations and queries run on both. No test uses a mock database.

## Consequences

- API tests are slow-ish (each file boots a Postgres in 1–3 s) and need no Docker or server.
- PGlite is single-connection, so it **cannot prove** the row-level locking that serializes one
  user's concurrent uploads; that lock (`select … for update` on the user row) is covered by
  reasoning and by the test that fires concurrent uploads, not by true parallelism.
- Migrations run on start-up (`connectPostgres`) and with `pnpm --filter @tutor-nvim/api db:migrate`.
