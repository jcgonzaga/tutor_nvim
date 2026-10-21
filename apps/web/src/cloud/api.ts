import { z } from "zod";
import {
  attemptBatchResultSchema,
  meSchema,
  progressSnapshotSchema,
  sessionRecordSchema,
  type AttemptResult,
  type AttemptSubmission,
  type LegacyImport,
  type Me,
  type ProgressSnapshot,
  type SessionSubmission,
  type Settings,
} from "@tutor-nvim/shared";

/** The server answered with an error status. `status` tells the caller whether to retry. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The request never got an answer: offline, DNS, CORS, a sleeping server. Always worth retrying. */
export class NetworkError extends Error {}

export interface CloudApi {
  me(): Promise<Me>;
  putSettings(settings: Settings): Promise<Me>;
  progress(): Promise<ProgressSnapshot>;
  postAttempts(attempts: readonly AttemptSubmission[]): Promise<AttemptResult[]>;
  postSession(session: SessionSubmission): Promise<void>;
  importLegacy(legacy: LegacyImport): Promise<void>;
}

interface ApiOptions {
  readonly baseUrl: string;
  readonly token: () => Promise<string | null>;
  readonly fetch?: typeof fetch;
}

/**
 * Typed client for the API (T-603..T-607). Every response is validated with the shared schemas, so
 * a server that drifts from the contract fails loudly here instead of corrupting local progress.
 * Nothing in the keypress path calls it: it runs in the background after an attempt is finished.
 */
export function createCloudApi({ baseUrl, token, fetch: fetchImpl = fetch }: ApiOptions): CloudApi {
  async function request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const bearer = await token();
    if (!bearer) throw new ApiError(401, "Not signed in");

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${bearer}`,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      throw new NetworkError(error instanceof Error ? error.message : "Network error");
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "message" in payload
          ? String((payload as { message: unknown }).message)
          : response.statusText;
      throw new ApiError(response.status, message);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new ApiError(502, `Unexpected response from ${path}`);
    return parsed.data;
  }

  return {
    me: () => request("GET", "/api/me", meSchema),
    putSettings: (settings) => request("PUT", "/api/me/settings", meSchema, settings),
    progress: () => request("GET", "/api/progress", progressSnapshotSchema),
    async postAttempts(attempts) {
      const { results } = await request("POST", "/api/attempts", attemptBatchResultSchema, {
        attempts,
      });
      return results;
    },
    async postSession(session) {
      await request("POST", "/api/sessions", sessionRecordSchema, session);
    },
    async importLegacy(legacy) {
      await request("POST", "/api/progress/import", z.object({ skills: z.number() }), legacy);
    },
  };
}
