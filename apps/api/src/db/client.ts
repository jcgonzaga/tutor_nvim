import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

/**
 * Services depend on this type, not on a driver: Neon/Postgres in production and an in-process
 * Postgres (PGlite) in tests and local development both satisfy it, so the same SQL and the same
 * migrations run everywhere.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  readonly db: Db;
  close(): Promise<void>;
}

// From src/db/ when run from source, from dist/ when run from the Vercel bundle (build-vercel.mjs).
const migrationsFolder =
  ["../../drizzle", "../drizzle"]
    .map((path) => fileURLToPath(new URL(path, import.meta.url)))
    .find((path) => existsSync(path)) ?? fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Postgres over the network (Neon or any Postgres), with migrations applied. */
export async function connectPostgres(
  connectionString: string,
  options: { readonly migrate?: boolean } = {},
): Promise<DbHandle> {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    // Fail with an error instead of hanging when the database cannot be reached (wrong host,
    // blocked network, a suspended Neon compute that does not wake).
    connectionTimeoutMillis: 15_000,
  });
  // An idle connection the server drops (Neon suspends and recycles them) emits `error` on the pool.
  // Unhandled, that would crash the process; the pool simply opens a new connection when needed.
  pool.on("error", () => undefined);
  const db = drizzlePg(pool, { schema });
  if (options.migrate ?? true) await migratePg(db, { migrationsFolder });
  return { db, close: () => pool.end() };
}

/**
 * A real Postgres running inside the process: no server needed for tests or a first local run.
 * PGlite is a dev dependency and is loaded only here, so a production image that leaves dev
 * dependencies out never needs it (`DATABASE_URL` is mandatory in production).
 */
export async function connectPglite(dataDir?: string): Promise<DbHandle> {
  const [{ PGlite }, { drizzle: drizzlePglite }, { migrate: migratePglite }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db, close: () => client.close() };
}
