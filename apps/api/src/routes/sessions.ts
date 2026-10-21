import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isoDay, sessionSubmissionSchema } from "@tutor-nvim/shared";
import { callerOf, type RouteContext } from "../app";
import { parse } from "../errors";
import { getOrCreateDailySession, submitSession } from "../services/sessions";

const dailyQuery = z.object({ date: isoDay, seed: z.string().max(100).default("") });
const writeLimit = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

export function registerSessionRoutes(
  api: FastifyInstance,
  { db, bundle, now }: RouteContext,
): void {
  api.get("/api/session/daily", async (request) =>
    getOrCreateDailySession(
      db,
      bundle,
      callerOf(request).id,
      parse(dailyQuery, request.query),
      now(),
    ),
  );

  api.post("/api/sessions", writeLimit, async (request, reply) => {
    const record = await submitSession(
      db,
      bundle,
      callerOf(request).id,
      parse(sessionSubmissionSchema, request.body),
    );
    return reply.status(201).send(record);
  });
}
