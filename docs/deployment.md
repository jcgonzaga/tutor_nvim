# Deployment

Two artifacts, built by the `release` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
only after every gate passed on `main`:

| Artifact | What it is                                                        | Where it runs                        |
| -------- | ----------------------------------------------------------------- | ------------------------------------ |
| Web app  | Static files in `apps/web/dist`                                   | Any static host / CDN                |
| API      | Docker image from [`apps/api/Dockerfile`](../apps/api/Dockerfile) | Any container host + Postgres (Neon) |

The product works without the API (progress stays in the browser). Deploying the API adds accounts
and sync; it is never in the keypress path (AGENTS.md section 25).

Hosting decision: **Vercel** for both the web app and the API, Neon for Postgres and auth. Deploys
come from Vercel's Git integration (two projects on this repository); CI's `release` job gates what
is on `main` and applies the database migrations. The Docker image stays as the portable,
verified way to run the API anywhere else.

## Vercel

Create two projects from the same repository (Root Directory, "include files outside the root
directory" on):

| Project | Root Directory | Config                                            | Notes                                                                                                                                                                                            |
| ------- | -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| web     | `apps/web`     | [`apps/web/vercel.json`](../apps/web/vercel.json) | Static; hashed assets cached for a year                                                                                                                                                          |
| api     | `apps/api`     | [`apps/api/vercel.json`](../apps/api/vercel.json) | Fastify entry `src/server.ts`; `tsconfig.json` repeats the base options (Vercel's type-check ignores `extends`); content is embedded in the code (`pnpm content:embed` after editing `content/`) |

Set the variables from the tables below in each project (web: `VITE_*` at build time; api: runtime).
For the API also set `MIGRATE_ON_START=false` and add the `DATABASE_URL` secret to the GitHub
repository so the release job migrates before promotion. Use Neon's **pooled** connection string.

**Not verified.** The web build is the same one CI and the performance budgets run. The API on
Vercel could not be deployed from the build environment (no Vercel account or network access), so
its first deploy is the test: check `/api/ready`, then sign in once. Points to watch, in order:
cold start time (content validation and
sync run at boot), and the `pg` pool size under concurrency (`max: 10` per instance; Neon pooling
absorbs it). If Vercel is a poor fit for the API, the Dockerfile route below needs no code change.

## API

Build from the repository root (the workspace packages are part of the image):

```bash
docker build -f apps/api/Dockerfile -t tutor-nvim-api .
```

The image runs the TypeScript sources through `tsx` (the workspace packages export `.ts`), as the
`node` user, with production dependencies only. On start it validates the content (refusing to start
on invalid content), applies pending migrations, syncs content into the database, then listens.

| Variable             | Required in production | Meaning                                                               |
| -------------------- | ---------------------- | --------------------------------------------------------------------- |
| `NODE_ENV`           | yes (set by the image) | `production` turns on the safety checks below                         |
| `DATABASE_URL`       | yes                    | Postgres connection string (Neon: use the pooled one)                 |
| `AUTH_MODE`          | `neon` (default)       | `fake` is refused in production                                       |
| `NEON_AUTH_BASE_URL` | yes with `neon`        | Base URL of the Neon Auth instance; its origin is the expected issuer |
| `NEON_AUTH_JWKS_URL` | no                     | Defaults to `<base>/.well-known/jwks.json`                            |
| `CORS_ORIGIN`        | yes                    | Comma-separated web origin(s), e.g. `https://app.example.com`         |
| `PORT`               | no (8787)              |                                                                       |
| `LOG_LEVEL`          | no (`info`)            | JSON logs on stdout, one `requestId` per request                      |
| `RATE_LIMIT_MAX`     | no (300/min/client)    |                                                                       |

Endpoints for the platform: `GET /api/health` (process is up; use as liveness) and
`GET /api/ready` (database answers; use as readiness). Every response carries `x-request-id`, which
also appears in the logs and in the body of a 500, so a user report can be matched to a log line.

### Verified

The boot below was run for this milestone against a real Postgres 16 with a production-only install
(the layout the Dockerfile produces), not against PGlite:

- migrations applied from scratch (14 tables), content synced, `/api/health` and `/api/ready` 200;
- `AUTH_MODE=fake` in production, or a missing `DATABASE_URL`, stops the process with
  `Invalid configuration`;
- `Bearer test:<id>` (the fake-auth token) is rejected with 401 in production mode;
- logs are JSON with `requestId`.

Not verified here (no Docker daemon and no network access to Neon in the build environment): the
`docker build` itself, and a live Neon database / Neon Auth instance. The first deploy should check
`/api/ready` and sign in once before announcing anything.

### Migrations

Applied automatically on start (`drizzle/`), forward-only. Generate new ones with
`pnpm --filter @tutor-nvim/api db:generate` and review the SQL; never edit the schema by hand in
production (AGENTS.md section 24). Run them without starting the server with
`pnpm --filter @tutor-nvim/api db:migrate`.

## Web app

```bash
VITE_API_URL=https://api.example.com \
VITE_NEON_AUTH_URL=https://<neon-auth-host> \
VITE_BUILD_ID=$(git rev-parse --short HEAD) \
pnpm --filter @tutor-nvim/web build
```

| Variable             | Effect when unset                                                         |
| -------------------- | ------------------------------------------------------------------------- |
| `VITE_API_URL`       | No cloud: local-only product, no account UI                               |
| `VITE_NEON_AUTH_URL` | Same: sign-in needs both                                                  |
| `VITE_ERROR_URL`     | Defaults to `<VITE_API_URL>/api/client-errors`; with no API, console only |
| `VITE_ANALYTICS_URL` | No analytics at all (the setting is not even shown)                       |
| `VITE_BUILD_ID`      | Falls back to the Vite mode; set it so errors and events name the release |

Serve `dist/` as a single-page app (all routes use `#/...`, so no rewrite rules are needed) and set
long cache lifetimes on `assets/*` (hashed names).

## Privacy defaults

- Analytics are **opt-in** and off until the learner enables them in Settings; with no consent the
  events are dropped before they are stored. They carry content ids and numbers only.
- Error reports are scrubbed (no buffer text or typed keys), deduplicated and capped per session.
- Sound is off by default.

## Open decisions

1. ~~Hosting~~ decided: Vercel (see above).
2. Analytics collector: `VITE_ANALYTICS_URL` accepts any endpoint that takes the JSON envelope in
   `apps/web/src/analytics/events.ts`. No vendor SDK was added.
3. ~~Analytics consent~~ decided: stays opt-in (off until the learner turns it on).
