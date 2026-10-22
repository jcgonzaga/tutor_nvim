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

## Vercel + Neon runbook

Verified end to end on 2026-10-22: web and API on Vercel, Neon Postgres and Neon Auth, sign-up from
the deployed web app, and the `users` row created in Neon. Follow the steps in this order; the
variables of each project need the URL of the other, which is the only awkward part.

### 1. Neon

1. Create a project (Postgres 16/17) in the region closest to the Vercel Function Region you will
   use for the API (a statement per round trip is slow across regions).
2. **Connect** gives two connection strings. `DATABASE_URL` in the API's Vercel project is the
   **pooled** one (host contains `-pooler`). The GitHub secret `DATABASE_URL` (release-time
   migrations) is the **direct** one. If the driver fails to connect, remove
   `&channel_binding=require` from the string.
3. Never create tables by hand. Migrations create them (see step 5).
4. **Auth**: enable Neon Auth (managed Better Auth). Copy the Auth URL
   (`https://ep-xxxx.neonauth.<region>.aws.neon.tech/neondb/auth`); it is both
   `NEON_AUTH_BASE_URL` (API) and `VITE_NEON_AUTH_URL` (web). Check that
   `<Auth URL>/.well-known/jwks.json` returns JSON with a `keys` list.
5. **Trusted domains**: add the web origin (`https://<web>.vercel.app`, with scheme, no trailing
   slash) and `http://localhost:5173`.
6. Leave **email verification** off for now: the app has no screen for it, and with it on sign-up
   returns no session.

### 2. Vercel: two projects from this repository

Both: "Include source files outside of the Root Directory" on. The production branch must be
`main` (Settings, Environments, Production, Branch Tracking); any other branch deploys as Preview
and only gets the variables enabled for Preview, so tick Production on every variable.

GitHub side, for release-time migrations: repository Settings, Secrets and variables, Actions, New
repository **secret** `DATABASE_URL` with the Neon **direct** string (pooling off).

| Project | Root Directory | Framework preset | Config                                            |
| ------- | -------------- | ---------------- | ------------------------------------------------- |
| api     | `apps/api`     | Fastify          | [`apps/api/vercel.json`](../apps/api/vercel.json) |
| web     | `apps/web`     | Vite             | [`apps/web/vercel.json`](../apps/web/vercel.json) |

Set the Function Region of the API (Settings, Functions) next to the Neon region.

API variables (runtime). Values with no quotes, no spaces, no `NAME=` prefix; a wrong
`NEON_AUTH_BASE_URL` fails start-up with `Invalid configuration` (see the API table below for all
of them):

| Variable             | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`       | Neon **pooled** string                                      |
| `AUTH_MODE`          | `neon`                                                      |
| `NEON_AUTH_BASE_URL` | the Auth URL                                                |
| `CORS_ORIGIN`        | `https://<web>.vercel.app` (comma-separated for several)    |
| `MIGRATE_ON_START`   | `false` (the migrations folder is not part of the function) |

Web variables (build time, so a change needs a redeploy of the web project):

| Variable             | Value                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| `VITE_API_URL`       | `https://<api>.vercel.app`: no trailing slash, **no `/api`** (the app adds it) |
| `VITE_NEON_AUTH_URL` | the same Auth URL                                                              |

Order: deploy the API (any `CORS_ORIGIN`), deploy the web with `VITE_API_URL`, then set the real
`CORS_ORIGIN` and redeploy the API. Picking the web project's name first avoids the second round.
Environment variable changes only apply to new deployments.

### 3. How the API is packaged (and why)

The API is a Fastify app whose workspace packages export `.ts`. Vercel's default build does not
work for that, for reasons found one at a time; each fix is load-bearing:

| Symptom on Vercel                                                        | Cause and fix                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unused_function` for `functions` in `vercel.json`                       | The `functions` pattern did not match. The block was removed; nothing in the project needs it.                                                                                                                                                 |
| `NODE_TYPESCRIPT_ERROR` on correct code (`lastDay` optional vs required) | Vercel's type-check ignores `extends`, so it ran without `strict`. `apps/api/tsconfig.json` repeats the base options; `src/tsconfig.test.ts` keeps them in sync.                                                                               |
| `ERR_MODULE_NOT_FOUND ... /src/errors`                                   | Vercel emits one `.js` per `.ts`; Node ESM rejects our extensionless imports (~400 of them). `build-vercel.mjs` bundles `src/server.ts` into `dist/server.mjs` with esbuild (third-party packages stay external); it runs in `installCommand`. |
| `No entrypoint found which imports fastify`                              | Vercel only accepts an entry file that imports `fastify`. `src/index.ts` imports `fastify` and the bundle; `app.ts` was renamed `build-app.ts` so it cannot win the entry detection.                                                           |
| `content/` not found at run time                                         | Serverless bundles only ship what the code imports. `src/content.embedded.ts` (generated, test-synced) is used when `content/` is not on disk. Run `pnpm content:embed` after editing content.                                                 |
| 500 `FUNCTION_INVOCATION_FAILED`, slow, no log                           | Two causes: content sync did a statement per row (now one multi-row statement per table), and `await app.listen()` at module level (Vercel captures `listen()`; it is not awaited now).                                                        |

Start-up logs `boot: config ok / content ok / database ready / content synced`; the last one
printed says where a failing start stopped. The database pool gives up after 15 s instead of
hanging.

### 4. Check it

1. `https://<api>/api/health` is `{"ok":true}` (process up).
2. `https://<api>/api/ready` is `{"ready":true}` (database answers).
3. Open the web app, create an account, do an exercise, and see the row in Neon (`users`).

### 5. Migrations

The API never migrates on Vercel. Apply them once from a machine with the repository:

```bash
DATABASE_URL='<Neon direct string>' pnpm --filter @tutor-nvim/api db:migrate
```

or let CI do it: the `release` job in `.github/workflows/ci.yml` runs the same command on every
push to `main` if the GitHub secret `DATABASE_URL` (direct string) exists. Every new migration
needs one of the two before the code that uses it is promoted.

### 6. Known limits

- **Third-party cookie.** The web app (`*.vercel.app`) and Neon Auth (`*.neon.tech`) are different
  sites, so the Auth session cookie is third-party. Safari and browsers that block third-party
  cookies may fail to sign in. The fix is a same-origin rewrite of `/auth/*` to the Auth URL in
  `apps/web/vercel.json`; not done yet. Practice never needs an account.
- The `pg` pool is `max: 10` per instance; Neon's pooled endpoint absorbs it.
- Content validation and sync run at every cold start (a few statements).
- If Vercel turns out to be a poor fit for the API, the Docker route below needs no code change.

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

Not verified: the `docker build` itself (no Docker daemon in the build environment). A live Neon
database and Neon Auth instance were verified on Vercel (see the runbook above): sign-up creates the
`users` row.

### Migrations

Applied automatically on start of the Docker image (`drizzle/`; not on Vercel, see the runbook), forward-only. Generate new ones with
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
