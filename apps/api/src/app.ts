import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ContentBundle } from "@tutor-nvim/exercise-schema";
import type { TokenVerifier } from "./auth/verifier";
import type { Db } from "./db/client";
import { HttpError } from "./errors";
import { registerAttemptRoutes } from "./routes/attempts";
import { registerMeRoutes } from "./routes/me";
import { registerProgressRoutes } from "./routes/progress";
import { registerSessionRoutes } from "./routes/sessions";
import { registerSkillRoutes } from "./routes/skills";
import { ensureUser } from "./services/users";

export interface AppDeps {
  readonly db: Db;
  readonly bundle: ContentBundle;
  readonly verifier: TokenVerifier;
  /** Epoch ms. Injected so scheduling is testable; never read from the system clock in a route. */
  readonly now?: () => number;
  readonly corsOrigins?: readonly string[];
  /** Requests per minute per client. */
  readonly rateLimitMax?: number;
}

/** The authenticated caller of a request. */
export interface Caller {
  readonly id: string;
  readonly authUserId: string;
  readonly email: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    caller: Caller | null;
  }
}

export const callerOf = (request: FastifyRequest): Caller => {
  if (!request.caller) throw new HttpError(401, "unauthorized", "Sign in to use this endpoint");
  return request.caller;
};

/**
 * Builds the API (T-602..T-607). Persistence is in the database, learning behaviour is in the
 * domain packages, and nothing here is in the keypress path: the client plays locally and uploads
 * finished attempts.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });
  const now = deps.now ?? (() => Date.now());

  await app.register(cors, {
    origin: deps.corsOrigins ? [...deps.corsOrigins] : false,
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type"],
  });
  await app.register(rateLimit, { max: deps.rateLimitMax ?? 300, timeWindow: "1 minute" });

  app.decorateRequest("caller", null);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.status).send({ error: error.code, message: error.message });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "invalid_request", message: error.message });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const code = (error as { code?: string }).code ?? "bad_request";
      return reply
        .status(status)
        .send({ error: code.toLowerCase(), message: (error as Error).message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "internal", message: "Something went wrong" });
  });

  app.get("/api/health", async () => ({ ok: true }));

  await app.register(async (api) => {
    api.addHook("onRequest", async (request) => {
      const header = request.headers.authorization;
      const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
      const identity = token ? await deps.verifier.verify(token) : null;
      if (!identity) throw new HttpError(401, "unauthorized", "Missing or invalid token");
      request.caller = await ensureUser(deps.db, identity);
    });

    const context = { db: deps.db, bundle: deps.bundle, now };
    registerMeRoutes(api, context);
    registerSkillRoutes(api, context);
    registerProgressRoutes(api, context);
    registerSessionRoutes(api, context);
    registerAttemptRoutes(api, context);
  });

  return app;
}

export interface RouteContext {
  readonly db: Db;
  readonly bundle: ContentBundle;
  readonly now: () => number;
}
