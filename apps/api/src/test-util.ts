import type { FastifyInstance } from "fastify";
import {
  advanceAttempt,
  simulateSolution,
  startAttempt,
  type Attempt,
} from "@tutor-nvim/evaluation";
import { keysForCommand, type Exercise } from "@tutor-nvim/exercise-schema";
import { keyInputFromToken } from "@tutor-nvim/vim-engine";
import type { AttemptSubmissionInput } from "@tutor-nvim/shared";
import { buildApp, type AppDeps } from "./build-app";
import { createFakeVerifier, fakeToken } from "./auth/fake";
import { loadContentBundle } from "./content";
import pg from "pg";
import { connectPglite, connectPostgres, type DbHandle } from "./db/client";
import { syncContent } from "./db/syncContent";

export const bundle = loadContentBundle();

export const exerciseNamed = (slug: string): Exercise => {
  const found = bundle.exercises.find((exercise) => exercise.slug === slug);
  if (!found) throw new Error(`No exercise ${slug}`);
  return found;
};

/**
 * A fresh, migrated database. In-process Postgres by default; set `TEST_DATABASE_URL` to a server
 * (CI does) and every test file runs the same queries on real Postgres through the `pg` driver, in
 * its own throwaway database.
 */
export async function openTestDb(): Promise<DbHandle> {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin) return connectPglite();

  const name = `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  await client.query(`create database ${name}`);
  await client.end();

  const url = new URL(admin);
  url.pathname = `/${name}`;
  const handle = await connectPostgres(url.toString());
  return {
    db: handle.db,
    async close() {
      await handle.close();
      const cleaner = new pg.Client({ connectionString: admin });
      await cleaner.connect();
      await cleaner.query(`drop database if exists ${name} with (force)`);
      await cleaner.end();
    },
  };
}

export interface TestApi {
  readonly app: FastifyInstance;
  readonly handle: DbHandle;
  /** Mutable clock: tests move time by assigning `clock.now`. */
  readonly clock: { now: number };
  request(
    method: "GET" | "POST" | "PUT",
    url: string,
    options?: { user?: string | null; body?: unknown },
    // The body is untyped JSON straight off the wire; tests assert on its shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ status: number; body: any }>;
  close(): Promise<void>;
}

export const T0 = Date.UTC(2026, 9, 21, 9, 0, 0);

export async function createTestApi(overrides: Partial<AppDeps> = {}): Promise<TestApi> {
  const handle = await openTestDb();
  await syncContent(handle.db, bundle);
  const clock = { now: T0 };
  const app = await buildApp({
    db: handle.db,
    bundle,
    verifier: createFakeVerifier(),
    now: () => clock.now,
    rateLimitMax: 100_000,
    ...overrides,
  });
  return {
    app,
    handle,
    clock,
    async request(method, url, options = {}) {
      const headers: Record<string, string> = {};
      if (options.user !== null && options.user !== undefined) {
        headers.authorization = `Bearer ${fakeToken(options.user)}`;
      }
      const response = await app.inject({
        method,
        url,
        headers,
        ...(options.body !== undefined ? { payload: options.body as object } : {}),
      });
      const text = response.body;
      return { status: response.statusCode, body: text ? JSON.parse(text) : null };
    },
    async close() {
      await app.close();
      await handle.close();
    },
  };
}

let counter = 0;
export const newId = (): string => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

/** What the client uploads for an attempt, built from an engine-simulated attempt. */
export function submissionFromAttempt(
  exercise: Exercise,
  attempt: Attempt,
  options: {
    id?: string;
    finishedAt: number;
    gaveUp?: boolean;
    sessionId?: string;
    localDay?: string;
  },
): AttemptSubmissionInput {
  return {
    id: options.id ?? newId(),
    exerciseId: exercise.id,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    gaveUp: options.gaveUp ?? false,
    finishedAt: options.finishedAt,
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    ...(options.localDay ? { localDay: options.localDay } : {}),
    events: attempt.events.map((event) => ({
      key: event.key,
      code: event.code,
      ctrl: event.ctrl,
      alt: event.alt,
      shift: event.shift,
      meta: event.meta,
      timestamp: event.timestamp,
    })),
    hints: attempt.hints.map((hint) => ({ level: hint.level, timestamp: hint.timestamp })),
  };
}

/** A learner who solves the exercise with its optimal solution. */
export function solved(
  exercise: Exercise,
  options: { id?: string; finishedAt: number; sessionId?: string; localDay?: string },
): AttemptSubmissionInput {
  const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
  if (!optimal) throw new Error(`${exercise.slug} has no optimal solution`);
  const attempt = simulateSolution(exercise, optimal, { stepMs: 150 });
  return submissionFromAttempt(exercise, attempt, options);
}

/** A learner who gives up without typing anything. */
export function gaveUp(
  exercise: Exercise,
  options: { id?: string; finishedAt: number; sessionId?: string; localDay?: string },
): AttemptSubmissionInput {
  const attempt = { ...startAttempt(exercise, 0), completedAt: 5000 };
  return submissionFromAttempt(exercise, attempt, { ...options, gaveUp: true });
}

/** Types commands as a learner would (every key, Enter after each), 150 ms apart. */
export function simulateCommands(exercise: Exercise, commands: readonly string[]): Attempt {
  const keys = commands.flatMap(keysForCommand);
  return keys.reduce<Attempt>(
    (attempt, token, index) =>
      advanceAttempt(exercise, attempt, {
        ...keyInputFromToken(token),
        timestamp: (index + 1) * 150,
      }),
    startAttempt(exercise, 0),
  );
}
