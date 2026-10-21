import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    HOST: z.string().default("0.0.0.0"),
    /** Postgres (Neon) connection string. Without it the API runs on in-process Postgres (dev only). */
    DATABASE_URL: z.string().min(1).optional(),
    /** `neon` verifies Neon Auth JWTs; `fake` accepts `test:<id>` tokens and is for tests/dev only. */
    AUTH_MODE: z.enum(["neon", "fake"]).default("neon"),
    /** Base URL of the Neon Auth (Better Auth) instance; its origin is the expected issuer. */
    NEON_AUTH_BASE_URL: z.url().optional(),
    /** Defaults to `<NEON_AUTH_BASE_URL>/.well-known/jwks.json`. */
    NEON_AUTH_JWKS_URL: z.url().optional(),
    /** Comma-separated list of web origins allowed by CORS. */
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    /** Requests per minute per client for the whole API. */
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  })
  .superRefine((env, ctx) => {
    const problem = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (env.AUTH_MODE === "neon" && !env.NEON_AUTH_BASE_URL) {
      problem("NEON_AUTH_BASE_URL", "is required when AUTH_MODE=neon");
    }
    if (env.NODE_ENV === "production") {
      // The fake verifier trusts any caller; it must be impossible to ship it by accident.
      if (env.AUTH_MODE === "fake") problem("AUTH_MODE", "fake auth is not allowed in production");
      if (!env.DATABASE_URL) problem("DATABASE_URL", "is required in production");
    }
  });

export type Config = z.output<typeof envSchema>;

export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
