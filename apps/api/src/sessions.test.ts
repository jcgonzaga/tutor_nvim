import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDailySession, sessionItems } from "@tutor-nvim/pedagogy";
import { T0, bundle, createTestApi, exerciseNamed, newId, solved, type TestApi } from "./test-util";

let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
});
afterAll(async () => api.close());

const NORMAL = "vim.mode-normal.basic-001";
const DATE = "2026-10-21";

describe("daily session (T-605)", () => {
  it("builds the day's plan and returns the same one when asked again", async () => {
    const first = await api.request("GET", `/api/session/daily?date=${DATE}`, { user: "ana" });
    const again = await api.request("GET", `/api/session/daily?date=${DATE}`, { user: "ana" });

    expect(first.status).toBe(200);
    expect(sessionItemsOf(first.body.plan).length).toBeGreaterThan(0);
    expect(again.body).toEqual(first.body);
  });

  it("is the same plan the client builds from the same state (the builder is shared)", async () => {
    const response = await api.request("GET", `/api/session/daily?date=${DATE}`, { user: "ben" });
    const me = await api.request("GET", "/api/me", { user: "ben" });
    const local = buildDailySession({
      userId: me.body.id,
      date: DATE,
      now: T0,
      skills: bundle.skills,
      exercises: bundle.exercises,
      learner: { skills: {} },
      history: [],
    });
    expect(response.body.plan).toEqual(JSON.parse(JSON.stringify(local)));
  });

  it("builds from the server's learner state: after progress, reviews come first", async () => {
    const attempt = solved(exerciseNamed(NORMAL), { finishedAt: T0 });
    await api.request("POST", "/api/attempts", { user: "cleo", body: { attempts: [attempt] } });
    api.clock.now = T0 + 3 * 86_400_000;
    const plan = await api.request("GET", "/api/session/daily?date=2026-10-24", { user: "cleo" });
    api.clock.now = T0;

    expect(plan.body.plan.reviews.length).toBeGreaterThan(0);
  });

  it("rejects a malformed date", async () => {
    expect(
      (await api.request("GET", "/api/session/daily?date=tomorrow", { user: "ana" })).status,
    ).toBe(400);
    expect((await api.request("GET", "/api/session/daily", { user: "ana" })).status).toBe(400);
  });
});

describe("recording sessions (T-605)", () => {
  const item = (exerciseId: string, position: number, attemptId?: string) => ({
    exerciseId,
    skillId: "vim.mode.normal",
    block: "learn",
    reason: "learn",
    position,
    repeat: false,
    ...(attemptId ? { attemptId } : {}),
  });

  it("links attempts uploaded before the session and shows it in the progress history", async () => {
    const exercise = exerciseNamed(NORMAL);
    const attempt = solved(exercise, { finishedAt: T0 + 1000 });
    await api.request("POST", "/api/attempts", { user: "dev", body: { attempts: [attempt] } });

    const sessionId = newId();
    const created = await api.request("POST", "/api/sessions", {
      user: "dev",
      body: {
        id: sessionId,
        date: DATE,
        startedAt: T0,
        finishedAt: T0 + 5000,
        items: [item(exercise.id, 0, attempt.id)],
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: sessionId, items: 1, abandoned: false });

    const { body } = await api.request("GET", "/api/progress", { user: "dev" });
    expect(body.sessions).toEqual([
      {
        date: DATE,
        startedAt: T0,
        finishedAt: T0 + 5000,
        exercises: 1,
        successes: 1,
        reviewsCompleted: 0,
        abandoned: false,
        xp: 20,
      },
    ]);
  });

  it("links attempts uploaded after the session", async () => {
    const exercise = exerciseNamed(NORMAL);
    const sessionId = newId();
    await api.request("POST", "/api/sessions", {
      user: "eli",
      body: {
        id: sessionId,
        date: DATE,
        startedAt: T0,
        finishedAt: T0 + 9000,
        items: [item(exercise.id, 0)],
      },
    });
    await api.request("POST", "/api/attempts", {
      user: "eli",
      body: { attempts: [solved(exercise, { finishedAt: T0 + 1000, sessionId })] },
    });

    const { body } = await api.request("GET", "/api/progress", { user: "eli" });
    expect(body.sessions[0]).toMatchObject({ exercises: 1, successes: 1 });
  });

  it("is idempotent on the session id, and updates it when it finishes", async () => {
    const exercise = exerciseNamed(NORMAL);
    const sessionId = newId();
    const open = {
      id: sessionId,
      date: DATE,
      startedAt: T0,
      finishedAt: null,
      items: [item(exercise.id, 0)],
    };
    await api.request("POST", "/api/sessions", { user: "fay", body: open });
    await api.request("POST", "/api/sessions", {
      user: "fay",
      body: { ...open, finishedAt: T0 + 100 },
    });

    const { body } = await api.request("GET", "/api/progress", { user: "fay" });
    expect(body.sessions).toHaveLength(1);
  });

  it("leaves no trace of an abandoned session nobody played", async () => {
    await api.request("POST", "/api/sessions", {
      user: "gus",
      body: {
        id: newId(),
        date: DATE,
        startedAt: T0,
        finishedAt: T0 + 1,
        abandoned: true,
        items: [],
      },
    });
    const { body } = await api.request("GET", "/api/progress", { user: "gus" });
    expect(body.sessions).toEqual([]);
  });

  it("refuses someone else's session id and unknown exercises", async () => {
    const id = newId();
    const body = { id, date: DATE, startedAt: T0, finishedAt: null, items: [] };
    await api.request("POST", "/api/sessions", { user: "hal", body });
    expect((await api.request("POST", "/api/sessions", { user: "ida", body })).status).toBe(409);

    const unknown = { ...body, id: newId(), items: [item("nope", 0)] };
    expect(
      (await api.request("POST", "/api/sessions", { user: "ida", body: unknown })).status,
    ).toBe(422);
  });
});

function sessionItemsOf(plan: Parameters<typeof sessionItems>[0]) {
  return sessionItems(plan);
}
