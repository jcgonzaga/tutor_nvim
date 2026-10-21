import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
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

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Postgres over the network (Neon or any Postgres), with migrations applied. */
export async function connectPostgres(connectionString: string): Promise<DbHandle> {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder });
  return { db, close: () => pool.end() };
}

/** A real Postgres running inside the process: no server needed for tests or a first local run. */
export async function connectPglite(dataDir?: string): Promise<DbHandle> {
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db, close: () => client.close() };
}
