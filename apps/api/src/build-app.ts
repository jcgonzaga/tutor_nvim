import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import { ZodError } from "zod";
import type { ContentBundle } from "@tutor-nvim/exercise-schema";
import type { TokenVerifier } from "./auth/verifier";
import type { Db } from "./db/client";
import { HttpError, parse } from "./errors";
import { clientErrorSchema, type ClientError, type ErrorReporter } from "./observability";
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
  /** Fastify logger options (JSON lines). Off by default so tests stay quiet. */
  readonly logger?: FastifyServerOptions["logger"];
  /** Receives unexpected server errors (T-906). Failures are always logged as well. */
  readonly reporter?: ErrorReporter;
  /** Receives errors reported by the browser (T-906). They are always logged as well. */
  readonly onClientError?: (error: ClientError) => void;
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
  const app = Fastify({
    logger: deps.logger ?? false,
    bodyLimit: 4 * 1024 * 1024,
    // A caller (or a proxy in front of us) can supply the id; it is echoed so a user can quote it.
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
    genReqId: () => crypto.randomUUID(),
  });
  const now = deps.now ?? (() => Date.now());

  await app.register(cors, {
    origin: deps.corsOrigins ? [...deps.corsOrigins] : false,
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type"],
  });
  await app.register(rateLimit, { max: deps.rateLimitMax ?? 300, timeWindow: "1 minute" });

  app.decorateRequest("caller", null);

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler((error, request, reply) => {
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
    // Unexpected: log it with the request id, tell the reporter, and say nothing about the cause.
    request.log.error({ err: error }, "unhandled error");
    deps.reporter?.report(error, {
      requestId: request.id,
      method: request.method,
      route: request.routeOptions?.url ?? "unknown",
      userId: request.caller?.id ?? null,
    });
    return reply
      .status(500)
      .send({ error: "internal", message: "Something went wrong", requestId: request.id });
  });

  // Liveness: the process is up. Readiness: it can reach its database (what a load balancer checks).
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/ready", async (_request, reply) => {
    try {
      await deps.db.execute(sql`select 1`);
      return { ready: true };
    } catch {
      return reply.status(503).send({ ready: false });
    }
  });

  // The browser's error reports (T-906). Anonymous on purpose (a crash can happen before sign-in),
  // so it is small, strictly validated and rate-limited harder than the rest of the API.
  app.post(
    "/api/client-errors",
    { bodyLimit: 16 * 1024, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const clientError = parse(clientErrorSchema, request.body);
      request.log.warn({ clientError }, "client error");
      deps.onClientError?.(clientError);
      return reply.status(204).send();
    },
  );

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
