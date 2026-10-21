import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  evaluateAttempt,
  simulateSolution,
  startAttempt,
  type Attempt,
} from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import {
  applyAttempt,
  calibrationResult,
  completeOnboarding,
  createProfile,
  recordRung,
  setExperience,
  startCalibration,
  type Profile,
} from "@tutor-nvim/pedagogy";
import { fakeToken } from "../apps/api/src/auth/fake";
import { bundle, createTestApi, exerciseNamed, T0, type TestApi } from "../apps/api/src/test-util";
import { createCloudApi, ApiError, NetworkError, type CloudApi } from "../apps/web/src/cloud/api";
import {
  EMPTY_OUTBOX,
  enqueueAttempt,
  enqueueSession,
  isOutboxEmpty,
  type Outbox,
} from "../apps/web/src/cloud/outbox";
import { toAttemptSubmission, toSessionSubmission } from "../apps/web/src/cloud/submission";
import { runSync, type SyncOutcome } from "../apps/web/src/cloud/sync";

const { skills } = bundle;
const NORMAL = "vim.mode-normal.basic-001";
const ATOMIC = "vim.navigation-atomic.basic-001";

let api: TestApi;
beforeEach(async () => {
  api = await createTestApi();
});
afterEach(async () => api.close());

/** A `fetch` that talks to the in-process API, so the real client runs against the real server. */
function fetchInto(testApi: TestApi): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const response = await testApi.app.inject({
      method: (init?.method ?? "GET") as "GET" | "POST" | "PUT",
      url: `${url.pathname}${url.search}`,
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(init?.body ? { payload: String(init.body) } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

/** One browser: its profile, its outbox, and a client for the API. */
class Device {
  profile: Profile;
  outbox: Outbox = EMPTY_OUTBOX;
  private seq = 0;

  constructor(
    private readonly user: string | null,
    readonly cloud: CloudApi = createCloudApi({
      baseUrl: "http://api.test",
      token: async () => (user ? fakeToken(user) : null),
      fetch: fetchInto(api),
    }),
  ) {
    this.profile = createProfile(`local-${Math.random()}`, T0);
  }

  /** The learner plays an exercise: applied locally and queued for the cloud, like the web app does. */
  play(exercise: Exercise, options: { at: number; solve?: boolean; sessionId?: string }): void {
    const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
    const solve = options.solve ?? true;
    const attempt: Attempt =
      solve && optimal
        ? simulateSolution(exercise, optimal, { stepMs: 150 })
        : { ...startAttempt(exercise, 0), completedAt: 5000 };
    const evaluation = evaluateAttempt(exercise, attempt);
    this.profile = applyAttempt(this.profile, skills, {
      exercise,
      metrics: evaluation.metrics,
      at: options.at,
    }).profile;
    const id = `00000000-0000-4000-8000-${String(++this.seq + Math.floor(Math.random() * 1e6)).padStart(12, "0")}`;
    this.outbox = enqueueAttempt(
      this.outbox,
      toAttemptSubmission(exercise, attempt, {
        id,
        finishedAt: options.at,
        solved: evaluation.success,
        sessionId: options.sessionId ?? null,
      }),
    );
  }

  sync(overrides: Partial<Parameters<typeof runSync>[0]> = {}): Promise<SyncOutcome> {
    return runSync({
      api: this.cloud,
      getProfile: () => this.profile,
      getOutbox: () => this.outbox,
      setOutbox: (outbox) => {
        this.outbox = outbox;
      },
      updateProfile: (transition) => {
        this.profile = transition(this.profile);
      },
      ...overrides,
    });
  }
}

describe("cloud sync (T-608)", () => {
  it("the server computes the same progress the device computed locally", async () => {
    const device = new Device("ada");
    device.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    device.play(exerciseNamed(NORMAL), { at: T0 + 2000 });
    device.play(exerciseNamed(ATOMIC), { at: T0 + 3000, solve: false });
    const local = device.profile.learner;

    expect(await device.sync()).toEqual({ status: "synced", rejected: 0 });

    // After sync the profile holds the server's state. It is the same state, to the decimal,
    // because both sides run the same engine, evaluation and pedagogy over the same inputs.
    expect(device.profile.learner.skills["vim.mode.normal"]).toEqual(
      local.skills["vim.mode.normal"],
    );
    expect(device.profile.learner.skills["vim.navigation.atomic"]).toEqual(
      local.skills["vim.navigation.atomic"],
    );
    expect(device.profile.history).toHaveLength(3);
    expect(isOutboxEmpty(device.outbox)).toBe(true);
  });

  it("a second device receives the first device's progress after signing in", async () => {
    const laptop = new Device("bea");
    laptop.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    laptop.play(exerciseNamed(NORMAL), { at: T0 + 2000 });
    await laptop.sync();

    const phone = new Device("bea");
    expect(phone.profile.history).toHaveLength(0);
    await phone.sync();

    expect(phone.profile.learner).toEqual(laptop.profile.learner);
    expect(phone.profile.history).toEqual(laptop.profile.history);
    expect(phone.profile.personalBests).toEqual(laptop.profile.personalBests);
    // The phone now speaks as the cloud account, so both build the same daily session.
    expect(phone.profile.userId).toBe(laptop.profile.userId);
  });

  it("carries onboarding and the calibration placement to a new device", async () => {
    const laptop = new Device("cy");
    let state = startCalibration("basics");
    state = recordRung(recordRung(state, 1, true), 2, false);
    const calibration = calibrationResult(state);
    laptop.profile = completeOnboarding(
      setExperience(laptop.profile, "basics"),
      skills,
      calibration,
      T0,
    );
    await laptop.sync();

    const phone = new Device("cy");
    await phone.sync();
    expect(phone.profile.onboarding.completed).toBe(true);
    expect(phone.profile.onboarding.calibration).toEqual(calibration);
    expect(phone.profile.learner.placed).toEqual(laptop.profile.learner.placed);
  });

  it("uploads nothing twice: syncing again changes neither side", async () => {
    const device = new Device("di");
    device.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    await device.sync();
    const afterFirst = device.profile;
    await device.sync();
    await device.sync();
    expect(device.profile).toEqual(afterFirst);
    const { body } = await api.request("GET", "/api/progress", { user: "di" });
    expect(body.history).toHaveLength(1);
  });

  it("merges two devices that practiced separately, server first", async () => {
    const laptop = new Device("eve");
    const phone = new Device("eve");
    laptop.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    phone.play(exerciseNamed(ATOMIC), { at: T0 + 2000 });
    await laptop.sync();
    await phone.sync();
    await laptop.sync();

    for (const device of [laptop, phone]) {
      expect(device.profile.history.map((entry) => entry.exerciseId).sort()).toEqual(
        [exerciseNamed(NORMAL).id, exerciseNamed(ATOMIC).id].sort(),
      );
    }
    expect(laptop.profile.learner).toEqual(phone.profile.learner);
  });

  it("offline: nothing is lost, local progress is untouched, and the outbox waits", async () => {
    const offline = new Device("fay", {
      me: async () => {
        throw new NetworkError("offline");
      },
    } as unknown as CloudApi);
    offline.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    const before = offline.profile;

    expect(await offline.sync()).toEqual({ status: "offline" });
    expect(offline.profile).toBe(before);
    expect(offline.outbox.attempts).toHaveLength(1);
  });

  it("an attempt that finishes during the round trip is not undone by the snapshot", async () => {
    const real = createCloudApi({
      baseUrl: "http://api.test",
      token: async () => fakeToken("gus"),
      fetch: fetchInto(api),
    });
    let interrupted = false;
    const racing: CloudApi = {
      ...real,
      progress: async () => {
        const snapshot = await real.progress();
        if (!interrupted) {
          interrupted = true;
          // The learner finishes another exercise while the snapshot is still in flight.
          device.play(exerciseNamed(NORMAL), { at: T0 + 2000 });
        }
        return snapshot;
      },
    };
    const device: Device = new Device("gus", racing);
    device.play(exerciseNamed(NORMAL), { at: T0 + 1000 });

    await device.sync();

    expect(interrupted).toBe(true);
    expect(device.profile.learner.skills["vim.mode.normal"]?.attemptCount).toBe(2);
    expect(isOutboxEmpty(device.outbox)).toBe(true);
    const { body } = await api.request("GET", "/api/progress", { user: "gus" });
    expect(body.history).toHaveLength(2);
  });

  it("an expired sign-in is reported, and nothing is dropped", async () => {
    const device = new Device(null);
    device.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    expect(await device.sync()).toEqual({ status: "signed-out" });
    expect(device.outbox.attempts).toHaveLength(1);
  });

  it("drops an attempt the server will never accept instead of blocking the queue", async () => {
    const device = new Device("hal");
    device.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    const poison = device.outbox.attempts[0];
    if (!poison) throw new Error("nothing queued");
    device.outbox = enqueueAttempt(device.outbox, {
      ...poison,
      id: "00000000-0000-4000-8000-0000000fffff",
      exerciseId: "removed-from-content",
    });
    device.play(exerciseNamed(ATOMIC), { at: T0 + 3000 });

    expect(await device.sync()).toEqual({ status: "synced", rejected: 1 });
    expect(isOutboxEmpty(device.outbox)).toBe(true);
    const { body } = await api.request("GET", "/api/progress", { user: "hal" });
    expect(body.history).toHaveLength(2);
  });

  it("keeps retrying on a server error: the outbox is only emptied by an acknowledgement", async () => {
    const device = new Device("ivy", {
      me: async () => ({ id: "x", authUserId: "x", email: null, settings: {} }),
      postAttempts: async () => {
        throw new ApiError(503, "unavailable");
      },
    } as unknown as CloudApi);
    device.profile = completeOnboarding(device.profile, skills, null, T0);
    device.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    const outcome = await device.sync();
    expect(outcome.status).toBe("error");
    expect(device.outbox.attempts).toHaveLength(1);
  });

  it("adopts progress made before uploads existed, once, and keeps its history", async () => {
    const before = new Device("kit");
    before.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    before.play(exerciseNamed(NORMAL), { at: T0 + 2000 });
    before.outbox = EMPTY_OUTBOX; // a profile from the local-only product: nothing was ever queued
    const learner = before.profile.learner;

    await before.sync();
    expect(before.profile.learner.skills["vim.mode.normal"]).toEqual(
      learner.skills["vim.mode.normal"],
    );
    expect(before.profile.history).toHaveLength(2);

    const other = new Device("kit");
    await other.sync();
    expect(other.profile.learner.skills["vim.mode.normal"]).toEqual(
      learner.skills["vim.mode.normal"],
    );
  });

  it("does not adopt local progress into an account that already has its own", async () => {
    const first = new Device("lou");
    first.play(exerciseNamed(NORMAL), { at: T0 + 1000 });
    await first.sync();

    const second = new Device("lou");
    second.play(exerciseNamed(ATOMIC), { at: T0 + 2000 });
    second.outbox = EMPTY_OUTBOX; // local-only progress on a second device
    await second.sync();

    // The server's progress won: the second device's un-uploadable progress is not mixed in.
    expect(second.profile.learner.skills["vim.navigation.atomic"]?.attemptCount ?? 0).toBe(0);
    expect(second.profile.learner.skills["vim.mode.normal"]?.attemptCount).toBe(1);
  });

  it("records a finished session with its attempts", async () => {
    const device = new Device("jo");
    device.profile = completeOnboarding(device.profile, skills, null, T0);
    const exercise = exerciseNamed(NORMAL);
    const { buildDailySession, startSession } = await import("@tutor-nvim/pedagogy");
    const plan = buildDailySession({
      userId: device.profile.userId,
      date: "2026-10-21",
      now: T0,
      skills,
      exercises: bundle.exercises,
      learner: device.profile.learner,
      history: [],
    });
    device.profile = startSession(device.profile, plan, T0);
    const active = device.profile.activeSession;
    if (!active) throw new Error("no session");
    const { sessionIdOf } = await import("../apps/web/src/cloud/submission");
    device.play(exercise, { at: T0 + 1000, sessionId: sessionIdOf(device.profile, active) });
    const finished = {
      ...active,
      run: {
        ...active.run,
        completed: [
          {
            exerciseId: exercise.id,
            skillId: "vim.mode.normal",
            skillIds: exercise.skillIds,
            block: "learn" as const,
            repeat: false,
            success: true,
            performance: 100,
            scheduledReview: false,
            improved: [],
            at: T0 + 1000,
          },
        ],
      },
    };
    device.outbox = enqueueSession(
      device.outbox,
      toSessionSubmission(device.profile, finished, { finishedAt: T0 + 2000, abandoned: false }),
    );

    await device.sync();
    const { body } = await api.request("GET", "/api/progress", { user: "jo" });
    expect(body.sessions).toEqual([
      expect.objectContaining({ date: "2026-10-21", exercises: 1, successes: 1, abandoned: false }),
    ]);
  });
});
