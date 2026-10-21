import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { attemptEvents, attempts } from "./db/schema";
import {
  T0,
  createTestApi,
  exerciseNamed,
  gaveUp,
  newId,
  simulateCommands,
  solved,
  submissionFromAttempt,
  type TestApi,
} from "./test-util";

let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
});
afterAll(async () => api.close());

const NORMAL = "vim.mode-normal.basic-001";
const ATOMIC = "vim.navigation-atomic.basic-001";

describe("authentication (T-602)", () => {
  it("rejects requests without a valid token", async () => {
    expect((await api.request("GET", "/api/me")).status).toBe(401);
    const garbage = await api.app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: "Bearer nonsense" },
    });
    expect(garbage.statusCode).toBe(401);
  });

  it("keeps the health check open", async () => {
    expect(await api.request("GET", "/api/health")).toEqual({ status: 200, body: { ok: true } });
  });

  it("provisions a user on first sight and recognizes them afterwards", async () => {
    const first = await api.request("GET", "/api/me", { user: "alice" });
    const again = await api.request("GET", "/api/me", { user: "alice" });
    const other = await api.request("GET", "/api/me", { user: "bob" });

    expect(first.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(other.body.id).not.toBe(first.body.id);
    expect(first.body.settings).toMatchObject({ keyboardLayout: "us-ansi", experience: null });
  });
});

describe("skills (T-604)", () => {
  it("lists the catalog with prerequisites", async () => {
    const { status, body } = await api.request("GET", "/api/skills", { user: "alice" });
    expect(status).toBe(200);
    const words = body.skills.find(
      (skill: { slug: string }) => skill.slug === "vim.navigation.words",
    );
    expect(words.prerequisites).toEqual(["vim.navigation.atomic"]);
  });

  it("finds a skill by id or slug and 404s on an unknown one", async () => {
    const byId = await api.request("GET", "/api/skills/vim-navigation-words", { user: "alice" });
    const bySlug = await api.request("GET", "/api/skills/vim.navigation.words", { user: "alice" });
    expect(byId.body).toEqual(bySlug.body);
    expect((await api.request("GET", "/api/skills/nope", { user: "alice" })).status).toBe(404);
  });
});

describe("settings and placement (T-603)", () => {
  const calibration = {
    experience: "basics",
    placedRung: 1,
    probes: 2,
    rungs: [
      { topic: "hjkl", skillId: "vim.navigation.atomic", outcome: "assumed" },
      { topic: "mode switch", skillId: "vim.mode.insert", outcome: "passed" },
      { topic: "word movement", skillId: "vim.navigation.words", outcome: "failed" },
      { topic: "operator", skillId: "vim.operator.delete", outcome: "untested" },
    ],
  };

  it("derives the placement from the calibration, and grants no evidence", async () => {
    const put = await api.request("PUT", "/api/me/settings", {
      user: "carol",
      body: {
        keyboardLayout: "es-iso",
        experience: "basics",
        calibration,
        onboardingCompletedAt: T0,
        // A client cannot choose its own placement or skip ahead:
        placed: ["vim.operator.delete"],
      },
    });
    expect(put.status).toBe(200);
    expect(put.body.settings.keyboardLayout).toBe("es-iso");

    const { body } = await api.request("GET", "/api/progress", { user: "carol" });
    expect(body.learner.placed).toContain("vim.mode.insert");
    expect(body.learner.placed).not.toContain("vim.operator.delete");
    expect(body.learner.skills["vim.mode.insert"].attemptCount).toBe(0);
    expect(body.learner.skills["vim.mode.insert"].stage).toBe("learning");
    expect(body.learner.skills["vim.navigation.atomic"]).toBeDefined();
  });

  it("validates the body", async () => {
    const bad = await api.request("PUT", "/api/me/settings", {
      user: "carol",
      body: {
        keyboardLayout: "dvorak",
        experience: null,
        calibration: null,
        onboardingCompletedAt: null,
      },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_request");
  });
});

describe("attempts (T-606)", () => {
  it("replays the attempt on the server and applies it to the learner", async () => {
    const exercise = exerciseNamed(NORMAL);
    const submission = solved(exercise, { finishedAt: T0 + 1000 });
    const result = await api.request("POST", `/api/attempts/${submission.id}/complete`, {
      user: "dana",
      body: submission,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      strategy: "optimal",
      duplicate: false,
      exerciseId: exercise.id,
    });

    const { body } = await api.request("GET", "/api/progress", { user: "dana" });
    const skill = body.learner.skills["vim.mode.normal"];
    expect(skill.attemptCount).toBe(1);
    expect(skill.nextReviewAt).toBeGreaterThan(T0);
    expect(body.history).toHaveLength(1);
    expect(body.personalBests[exercise.id].performance).toBeGreaterThan(0);
  });

  it("decides success itself: an attempt that does not solve it is a failure", async () => {
    const exercise = exerciseNamed(ATOMIC);
    const submission = { ...solved(exercise, { finishedAt: T0 + 2000 }), events: [] };
    const result = await api.request("POST", "/api/attempts", {
      user: "erin",
      body: { attempts: [{ ...submission, gaveUp: true, completedAt: 3000 }] },
    });
    expect(result.body.results[0]).toMatchObject({ success: false, strategy: "failed" });

    const { body } = await api.request("GET", "/api/progress", { user: "erin" });
    expect(body.learner.skills["vim.navigation.atomic"].mastery).toBe(0);
  });

  it("stores every logical input, and ignores input after the goal was met", async () => {
    const exercise = exerciseNamed(NORMAL);
    const base = solved(exercise, { finishedAt: T0 + 3000 });
    const padded = {
      ...base,
      events: [...base.events, { key: "x", timestamp: 99_999 }, { key: "x", timestamp: 100_000 }],
    };
    await api.request("POST", `/api/attempts/${padded.id}/complete`, {
      user: "frank",
      body: padded,
    });

    const rows = await api.handle.db
      .select()
      .from(attemptEvents)
      .where(eq(attemptEvents.attemptId, padded.id));
    expect(rows).toHaveLength(base.events.length);
    expect(rows[0]).toMatchObject({ key: "Escape", accepted: true, mode: "insert" });
  });

  it("is idempotent: a retried upload is not counted twice", async () => {
    const exercise = exerciseNamed(NORMAL);
    const submission = solved(exercise, { finishedAt: T0 + 4000 });
    const first = await api.request("POST", "/api/attempts", {
      user: "gina",
      body: { attempts: [submission] },
    });
    const second = await api.request("POST", "/api/attempts", {
      user: "gina",
      body: { attempts: [submission] },
    });

    expect(first.body.results[0].duplicate).toBe(false);
    expect(second.body.results[0]).toMatchObject({ duplicate: true, success: true });
    const { body } = await api.request("GET", "/api/progress", { user: "gina" });
    expect(body.learner.skills["vim.mode.normal"].attemptCount).toBe(1);
    expect(body.history).toHaveLength(1);
  });

  it("refuses an attempt id that belongs to another user", async () => {
    const submission = solved(exerciseNamed(NORMAL), { finishedAt: T0 + 5000 });
    await api.request("POST", "/api/attempts", { user: "hana", body: { attempts: [submission] } });
    const stolen = await api.request("POST", "/api/attempts", {
      user: "ivan",
      body: { attempts: [submission] },
    });
    expect(stolen.status).toBe(409);
  });

  it("rejects unknown exercises and malformed bodies", async () => {
    const submission = solved(exerciseNamed(NORMAL), { finishedAt: T0 });
    const unknown = await api.request("POST", "/api/attempts", {
      user: "judy",
      body: { attempts: [{ ...submission, exerciseId: "does-not-exist" }] },
    });
    expect(unknown.status).toBe(422);

    expect(
      (await api.request("POST", "/api/attempts", { user: "judy", body: { attempts: [] } })).status,
    ).toBe(400);
    expect(
      (await api.request("POST", "/api/attempts", { user: "judy", body: { nope: 1 } })).status,
    ).toBe(400);
    const huge = {
      ...submission,
      events: Array.from({ length: 2001 }, () => ({ key: "j", timestamp: 1 })),
    };
    expect(
      (await api.request("POST", "/api/attempts", { user: "judy", body: { attempts: [huge] } }))
        .status,
    ).toBe(400);
  });

  it("requires the path id and the body id to agree", async () => {
    const submission = solved(exerciseNamed(NORMAL), { finishedAt: T0 });
    const result = await api.request("POST", `/api/attempts/${newId()}/complete`, {
      user: "kim",
      body: submission,
    });
    expect(result.status).toBe(400);
  });

  it("does not let a client schedule from the future", async () => {
    const submission = solved(exerciseNamed(NORMAL), { finishedAt: T0 + 365 * 86_400_000 });
    await api.request("POST", "/api/attempts", { user: "liam", body: { attempts: [submission] } });
    const rows = await api.handle.db.select().from(attempts).where(eq(attempts.id, submission.id));
    expect(rows[0]?.finishedAt).toBeLessThanOrEqual(T0 + 5 * 60_000);
  });

  it("keeps chronology when an older device uploads late", async () => {
    const exercise = exerciseNamed(NORMAL);
    const newer = solved(exercise, { finishedAt: T0 + 10_000 });
    const older = solved(exercise, { finishedAt: T0 + 1000 });
    await api.request("POST", "/api/attempts", { user: "mona", body: { attempts: [newer] } });
    await api.request("POST", "/api/attempts", { user: "mona", body: { attempts: [older] } });

    const { body } = await api.request("GET", "/api/progress", { user: "mona" });
    const times = body.history.map((entry: { at: number }) => entry.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(body.learner.skills["vim.mode.normal"].lastAttemptAt).toBe(T0 + 10_000);
  });

  it("sorts a batch by finish time before applying it", async () => {
    const exercise = exerciseNamed(NORMAL);
    const early = solved(exercise, { finishedAt: T0 + 1000 });
    const late = solved(exercise, { finishedAt: T0 + 2000 });
    const { body } = await api.request("POST", "/api/attempts", {
      user: "nora",
      body: { attempts: [late, early] },
    });
    expect(body.results.map((entry: { id: string }) => entry.id)).toEqual([early.id, late.id]);
  });

  it("does not lose updates when one user uploads from two devices at once", async () => {
    const exercises = [NORMAL, ATOMIC].map(exerciseNamed);
    const uploads = Array.from({ length: 6 }, (_, index) =>
      api.request("POST", "/api/attempts", {
        user: "omar",
        body: {
          attempts: [
            solved(exercises[index % 2] ?? exerciseNamed(NORMAL), { finishedAt: T0 + index }),
          ],
        },
      }),
    );
    expect((await Promise.all(uploads)).every((response) => response.status === 200)).toBe(true);

    const { body } = await api.request("GET", "/api/progress", { user: "omar" });
    expect(body.history).toHaveLength(6);
    const total =
      body.learner.skills["vim.mode.normal"].attemptCount +
      body.learner.skills["vim.navigation.atomic"].attemptCount;
    expect(total).toBe(6);
  });
});

describe("shell attempts (M10)", () => {
  const MKDIR = "shell.create.mkdir-001";

  it("replays a shell attempt with the same engine and applies it to the shell skill", async () => {
    const exercise = exerciseNamed(MKDIR);
    const submission = solved(exercise, { finishedAt: T0 + 1000 });
    const result = await api.request("POST", `/api/attempts/${submission.id}/complete`, {
      user: "shelly",
      body: submission,
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      strategy: "optimal",
      exerciseId: exercise.id,
    });

    const { body } = await api.request("GET", "/api/progress", { user: "shelly" });
    expect(body.learner.skills["linux.shell.create"].attemptCount).toBe(1);
    expect(body.history).toHaveLength(1);
  });

  it("stores the keys of the terminal with their own mode and the caret as the cursor", async () => {
    const exercise = exerciseNamed(MKDIR);
    const submission = solved(exercise, { finishedAt: T0 + 2000 });
    await api.request("POST", `/api/attempts/${submission.id}/complete`, {
      user: "shane",
      body: submission,
    });
    const rows = await api.handle.db
      .select()
      .from(attemptEvents)
      .where(eq(attemptEvents.attemptId, submission.id));
    expect(rows).toHaveLength(submission.events.length);
    expect(rows[0]).toMatchObject({ logicalKey: "m", mode: "shell", accepted: true });
    expect(rows[0]).toMatchObject({ cursorBeforeColumn: 0, cursorAfterColumn: 1 });
    expect(rows[rows.length - 1]).toMatchObject({ logicalKey: "<CR>", cursorAfterColumn: 0 });
  });

  it("decides success itself, and a command that failed lowers the score", async () => {
    const exercise = exerciseNamed(MKDIR);
    const clean = solved(exercise, { finishedAt: T0 + 3000 });
    const typo = submissionFromAttempt(
      exercise,
      simulateCommands(exercise, ["mkdri backup", "mkdir backup"]),
      { finishedAt: T0 + 3500 },
    );
    const a = await api.request("POST", `/api/attempts/${clean.id}/complete`, {
      user: "shaun",
      body: clean,
    });
    const b = await api.request("POST", `/api/attempts/${typo.id}/complete`, {
      user: "sheldon",
      body: typo,
    });
    expect(b.body.success).toBe(true);
    expect(b.body.performanceScore).toBeLessThan(a.body.performanceScore);

    // A forged claim of success is not believed: nothing in the tree changed.
    const forged = { ...clean, id: newId(), events: clean.events.slice(0, 3) };
    const refused = await api.request("POST", `/api/attempts/${forged.id}/complete`, {
      user: "sherry",
      body: forged,
    });
    expect(refused.body.success).toBe(false);
  });
});

describe("progress isolation (T-607)", () => {
  it("never shows one user's progress to another", async () => {
    await api.request("POST", "/api/attempts", {
      user: "pia",
      body: { attempts: [solved(exerciseNamed(NORMAL), { finishedAt: T0 })] },
    });
    const { body } = await api.request("GET", "/api/progress", { user: "quinn" });
    expect(body.history).toEqual([]);
    expect(body.learner.skills["vim.mode.normal"]?.attemptCount ?? 0).toBe(0);
  });

  it("returns a snapshot the client can validate", async () => {
    const { progressSnapshotSchema } = await import("@tutor-nvim/shared");
    const { body } = await api.request("GET", "/api/progress", { user: "pia" });
    expect(progressSnapshotSchema.safeParse(body).success).toBe(true);
  });
});

describe("failed attempts", () => {
  it("count as evidence and bring the skill back sooner", async () => {
    const exercise = exerciseNamed(NORMAL);
    await api.request("POST", "/api/attempts", {
      user: "ruth",
      body: { attempts: [gaveUp(exercise, { finishedAt: T0 })] },
    });
    const { body } = await api.request("GET", "/api/progress", { user: "ruth" });
    const skill = body.learner.skills["vim.mode.normal"];
    expect(skill.attemptCount).toBe(1);
    expect(skill.nextReviewAt - T0).toBeLessThan(60 * 60_000);
  });
});

describe("adopting progress from before uploads existed (ADR-0003)", () => {
  async function legacyProgress() {
    const { applyAttempt, createProfile } = await import("@tutor-nvim/pedagogy");
    const { evaluateAttempt, simulateSolution } = await import("@tutor-nvim/evaluation");
    const exercise = exerciseNamed(NORMAL);
    const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
    if (!optimal) throw new Error("no optimal solution");
    const metrics = evaluateAttempt(
      exercise,
      simulateSolution(exercise, optimal, { stepMs: 150 }),
    ).metrics;
    const applied = applyAttempt(
      createProfile("local", T0),
      (await import("./test-util")).bundle.skills,
      {
        exercise,
        metrics,
        at: T0 + 1000,
      },
    );
    return {
      learner: JSON.parse(JSON.stringify(applied.profile.learner)),
      personalBests: JSON.parse(JSON.stringify(applied.profile.personalBests)),
    };
  }

  it("reports whether an account has progress", async () => {
    expect((await api.request("GET", "/api/me", { user: "sam" })).body.hasProgress).toBe(false);
    await api.request("POST", "/api/attempts", {
      user: "sam",
      body: { attempts: [solved(exerciseNamed(NORMAL), { finishedAt: T0 })] },
    });
    expect((await api.request("GET", "/api/me", { user: "sam" })).body.hasProgress).toBe(true);
  });

  it("accepts it once into an empty account", async () => {
    const legacy = await legacyProgress();
    const imported = await api.request("POST", "/api/progress/import", {
      user: "tess",
      body: legacy,
    });
    expect(imported.status).toBe(201);

    const { body } = await api.request("GET", "/api/progress", { user: "tess" });
    expect(body.learner.skills["vim.mode.normal"].attemptCount).toBe(1);
    expect(body.personalBests[exerciseNamed(NORMAL).id]).toBeDefined();
    expect((await api.request("GET", "/api/me", { user: "tess" })).body.hasProgress).toBe(true);

    // ...and never again: the server's progress is authoritative.
    const again = await api.request("POST", "/api/progress/import", { user: "tess", body: legacy });
    expect(again.status).toBe(409);
  });

  it("refuses an account that already recorded attempts", async () => {
    await api.request("POST", "/api/attempts", {
      user: "uma",
      body: { attempts: [solved(exerciseNamed(NORMAL), { finishedAt: T0 })] },
    });
    const refused = await api.request("POST", "/api/progress/import", {
      user: "uma",
      body: await legacyProgress(),
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("account_not_empty");
  });

  it("drops skills and exercises it does not know, and rejects values out of range", async () => {
    const legacy = await legacyProgress();
    const skill = legacy.learner.skills["vim.mode.normal"];
    const withJunk = {
      learner: {
        skills: { ...legacy.learner.skills, "vim.made-up": { ...skill, skillId: "vim.made-up" } },
      },
      personalBests: {
        ...legacy.personalBests,
        "no-such-exercise": legacy.personalBests[exerciseNamed(NORMAL).id],
      },
    };
    const accepted = await api.request("POST", "/api/progress/import", {
      user: "vic",
      body: withJunk,
    });
    // Every real skill of the legacy profile is adopted (an applied attempt also records the other
    // root skills); the made-up one is not.
    expect(accepted.body).toEqual({ skills: Object.keys(legacy.learner.skills).length });
    const adopted = await api.request("GET", "/api/progress", { user: "vic" });
    expect(Object.keys(adopted.body.learner.skills)).not.toContain("vim.made-up");

    const absurd = {
      learner: { skills: { "vim.mode.normal": { ...skill, mastery: 9999 } } },
      personalBests: {},
    };
    expect(
      (await api.request("POST", "/api/progress/import", { user: "wes", body: absurd })).status,
    ).toBe(400);
  });
});
