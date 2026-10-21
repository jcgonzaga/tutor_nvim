import type { FastifyInstance } from "fastify";
import { legacyImportSchema } from "@tutor-nvim/shared";
import { callerOf, type RouteContext } from "../app";
import { parse } from "../errors";
import { importLegacyProgress } from "../services/legacy";
import { buildSnapshot } from "../services/progress";

export function registerProgressRoutes(
  api: FastifyInstance,
  { db, bundle, now }: RouteContext,
): void {
  api.get("/api/progress", async (request) =>
    buildSnapshot(db, bundle, callerOf(request).id, now()),
  );

  // One-time adoption of progress earned before attempts could be uploaded (ADR-0003).
  api.post(
    "/api/progress/import",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const result = await importLegacyProgress(
        db,
        bundle,
        callerOf(request).id,
        parse(legacyImportSchema, request.body),
      );
      return reply.status(201).send(result);
    },
  );
}
