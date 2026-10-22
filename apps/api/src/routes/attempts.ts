import type { FastifyInstance } from "fastify";
import { attemptBatchSchema, attemptSubmissionSchema } from "@tutor-nvim/shared";
import { callerOf, type RouteContext } from "../build-app";
import { HttpError, parse } from "../errors";
import { recordSubmission } from "../services/attempts";

const writeLimit = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

/**
 * The client plays an attempt locally and uploads it finished, so "create" and "complete" (T-606)
 * are one step: `POST /api/attempts` takes a batch (the sync outbox) and
 * `POST /api/attempts/:id/complete` takes one. Both are idempotent on the attempt id.
 */
export function registerAttemptRoutes(
  api: FastifyInstance,
  { db, bundle, now }: RouteContext,
): void {
  api.post("/api/attempts", writeLimit, async (request) => {
    const caller = callerOf(request);
    const { attempts } = parse(attemptBatchSchema, request.body);
    // In order: a later attempt at a skill builds on the evidence of the earlier ones.
    const ordered = [...attempts].sort((a, b) => a.finishedAt - b.finishedAt);
    const results = [];
    for (const attempt of ordered)
      results.push(await recordSubmission(db, bundle, caller.id, attempt, now()));
    return { results };
  });

  api.post<{ Params: { id: string } }>(
    "/api/attempts/:id/complete",
    writeLimit,
    async (request) => {
      const submission = parse(attemptSubmissionSchema, request.body);
      if (submission.id !== request.params.id) {
        throw new HttpError(
          400,
          "invalid_request",
          "The attempt id in the path and in the body differ",
        );
      }
      return recordSubmission(db, bundle, callerOf(request).id, submission, now());
    },
  );
}
