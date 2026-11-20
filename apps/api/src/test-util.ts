import type { FastifyInstance } from "fastify";
import {
  advanceAttempt,
  advanceWorkspaceKey,
  simulateSolution,
  startAttempt,
  type Attempt,
  type WorkspaceAttempt,
} from "@tutor-nvim/evaluation";
import {
  keysForCommand,
  type Exercise,
  type ShellExercise,
  type VimExercise,
  type WorkspaceExercise,
  type WorkspaceSolutionAction,
} from "@tutor-nvim/exercise-schema";
import { keyInputFromToken, parseKeySequence } from "@tutor-nvim/vim-engine";
import {
  attemptSubmissionSchema,
  type AttemptAction,
  type AttemptSubmission,
} from "@tutor-nvim/shared";
import { buildApp, type AppDeps } from "./build-app";
import { createFakeVerifier, fakeToken } from "./auth/fake";
import { loadContentBundle } from "./content";
import pg from "pg";
import { connectPglite, connectPostgres, type DbHandle } from "./db/client";
import { syncContent } from "./db/syncContent";

export const bundle = loadContentBundle();

/**
 * The kinds the API replays: every kind, including the workspace, whose attempt is replayed from its
 * actions rather than from keys (T9).
 */
export type ReplayableExercise = VimExercise | ShellExercise | WorkspaceExercise;

/** An exercise by slug, of any kind. */
export const exerciseNamed = (slug: string): ReplayableExercise => {
  const found = bundle.exercises.find((exercise) => exercise.slug === slug);
  if (!found) throw new Error(`No exercise ${slug}`);
  return found;
};

/**
 * How long a test file may wait for its database to boot.
 *
 * `openTestDb` starts an in-process pglite and runs the migrations, which takes ~15 s on this
 * machine and milliseconds against a real server. Vitest's default hook timeout is 10 s, so a file
 * that boots a database passes alone and fails as soon as several boot at once; the hook says how
 * long it is allowed to take instead of the suite being red for being parallel.
 */
export const DB_BOOT_TIMEOUT_MS = 120_000;

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
): AttemptSubmission {
  // Parsed by the wire schema, so a helper cannot build a submission the API would reject: a test
  // sees exactly what the browser's queue holds.
  return attemptSubmissionSchema.parse({
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
    // A workspace attempt is a sequence of steps, each an action a layer resolved or a key the engine
    // took: that is what the server replays, and why `events` is empty for it (T9).
    steps:
      attempt.kind === "workspace"
        ? attempt.steps.map((step) =>
            step.kind === "action"
              ? { kind: "action" as const, action: wireAction(step.action) }
              : {
                  kind: "key" as const,
                  key: step.key.key,
                  code: step.key.code ?? null,
                  ctrl: step.key.ctrl === true,
                  alt: step.key.alt === true,
                  shift: step.key.shift === true,
                  meta: step.key.meta === true,
                  timestamp: step.key.timestamp,
                },
          )
        : [],
    hints: attempt.hints.map((hint) => ({ level: hint.level, timestamp: hint.timestamp })),
  });
}

/**
 * One action in the wire shape. The client converts the same fields in
 * `apps/web/src/cloud/submission.ts`; a test helper is not allowed to import the app, so this copy
 * is the price of keeping the API's own tests separate from the browser's code.
 */
function wireAction(action: WorkspaceSolutionAction): AttemptAction {
  return {
    action: action.action,
    ...(action.target === undefined ? {} : { target: action.target }),
    ...(action.path === undefined ? {} : { path: action.path }),
    ...(action.text === undefined ? {} : { text: action.text }),
    ...(action.query === undefined ? {} : { query: action.query }),
    ...(action.command === undefined ? {} : { command: action.command }),
    ...(action.tab === undefined ? {} : { tab: action.tab }),
  };
}

/**
 * A learner who solves a story by typing rather than by a layer's actions (T9): the command line,
 * an insert and a save. Every step it produces is a key, so it is the attempt an API that only
 * replayed actions would refuse.
 */
export function typedInWorkspace(
  exercise: WorkspaceExercise,
  sequence: string,
  options: { startedAt?: number; stepMs?: number } = {},
): Attempt {
  const { startedAt = 0, stepMs = 150 } = options;
  const attempt = startAttempt(exercise, startedAt);
  if (attempt.kind !== "workspace") throw new Error(`${exercise.slug} is not a workspace exercise`);
  return parseKeySequence(sequence).reduce<Attempt>(
    (current, key, index) =>
      advanceWorkspaceKey(exercise, current as WorkspaceAttempt, {
        ...key,
        timestamp: startedAt + (index + 1) * stepMs,
      }).attempt,
    attempt,
  );
}

/** A learner who solves the exercise with its optimal solution: keys, or actions for a story. */
export function solved(
  exercise: Exercise,
  options: { id?: string; finishedAt: number; sessionId?: string; localDay?: string },
): AttemptSubmission {
  const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
  if (!optimal) throw new Error(`${exercise.slug} has no optimal solution`);
  const attempt = simulateSolution(exercise, optimal, { stepMs: 150 });
  return submissionFromAttempt(exercise, attempt, options);
}

/** A learner who gives up without typing anything (or, in a story, without taking an action). */
export function gaveUp(
  exercise: Exercise,
  options: { id?: string; finishedAt: number; sessionId?: string; localDay?: string },
): AttemptSubmission {
  const attempt = { ...startAttempt(exercise, 0), completedAt: 5000 };
  return submissionFromAttempt(exercise, attempt, { ...options, gaveUp: true });
}

/** Types commands as a learner would (every key, Enter after each), 150 ms apart. */
export function simulateCommands(
  exercise: ReplayableExercise,
  commands: readonly string[],
): Attempt {
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
