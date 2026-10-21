import { createFakeVerifier } from "./auth/fake";
import { createNeonVerifier } from "./auth/neon";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { productionLoggerOptions } from "./observability";
import { loadContentBundle } from "./content";
import { connectPglite, connectPostgres } from "./db/client";
import { syncContent } from "./db/syncContent";

const config = loadConfig();
const bundle = loadContentBundle();
const handle = config.DATABASE_URL
  ? await connectPostgres(config.DATABASE_URL, { migrate: config.MIGRATE_ON_START })
  : await connectPglite();
await syncContent(handle.db, bundle);

const verifier =
  config.AUTH_MODE === "fake"
    ? createFakeVerifier()
    : createNeonVerifier({
        baseUrl: config.NEON_AUTH_BASE_URL ?? "",
        ...(config.NEON_AUTH_JWKS_URL ? { jwksUrl: config.NEON_AUTH_JWKS_URL } : {}),
      });

const app = await buildApp({
  db: handle.db,
  bundle,
  verifier,
  corsOrigins: config.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
  rateLimitMax: config.RATE_LIMIT_MAX,
  logger: productionLoggerOptions(config.LOG_LEVEL),
});

// A process that hit something nobody handled is in an unknown state: say so, then exit and let the
// platform restart it.
for (const event of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(event, (reason) => {
    app.log.fatal({ err: reason }, event);
    process.exit(1);
  });
}

const shutdown = async () => {
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
app.log.info(
  `API listening on :${config.PORT} (auth=${config.AUTH_MODE}, db=${config.DATABASE_URL ? "postgres" : "in-process"})`,
);
