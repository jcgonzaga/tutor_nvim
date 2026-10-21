import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { fakeToken } from "./auth/fake";
import { productionLoggerOptions, type ErrorContext } from "./observability";
import { createTestApi, type TestApi } from "./test-util";

let api: TestApi | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const capture = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { lines, stream };
};

describe("liveness and readiness", () => {
  it("answers health without touching the database, and ready when the database answers", async () => {
    api = await createTestApi();
    expect((await api.request("GET", "/api/health")).body).toEqual({ ok: true });
    expect(await api.request("GET", "/api/ready")).toEqual({ status: 200, body: { ready: true } });
  });

  it("reports not ready (503) when the database is unreachable, so a load balancer stops sending traffic", async () => {
    api = await createTestApi();
    const broken = new Proxy(api.handle.db, {
      get(target, property, receiver) {
        if (property === "execute") return () => Promise.reject(new Error("connection lost"));
        return Reflect.get(target, property, receiver);
      },
    });
    const app = await (
      await import("./app")
    ).buildApp({
      db: broken,
      bundle: (await import("./test-util")).bundle,
      verifier: (await import("./auth/fake")).createFakeVerifier(),
    });
    const response = await app.inject({ method: "GET", url: "/api/ready" });
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({ ready: false });
    await app.close();
  });
});

describe("request ids", () => {
  it("answers with a request id on every response, and echoes one that was supplied", async () => {
    api = await createTestApi();
    const generated = await api.app.inject({ method: "GET", url: "/api/health" });
    expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const supplied = await api.app.inject({
      method: "GET",
      url: "/api/health",
      headers: { "x-request-id": "trace-abc" },
    });
    expect(supplied.headers["x-request-id"]).toBe("trace-abc");
  });
});

describe("unexpected errors (T-906)", () => {
  async function failingApi() {
    const reports: { error: unknown; context: ErrorContext }[] = [];
    const base = await createTestApi();
    api = base;
    const flaky = new Proxy(base.handle.db, {
      get(target, property, receiver) {
        if (property === "insert")
          return () => {
            throw new Error("secret internal detail: password=hunter2");
          };
        return Reflect.get(target, property, receiver);
      },
    });
    const { buildApp } = await import("./app");
    const { createFakeVerifier } = await import("./auth/fake");
    const { bundle } = await import("./test-util");
    const logs = capture();
    const app = await buildApp({
      db: flaky,
      bundle,
      verifier: createFakeVerifier(),
      logger: { ...productionLoggerOptions("info"), stream: logs.stream },
      reporter: { report: (error, context) => reports.push({ error, context }) },
    });
    return { app, reports, logs };
  }

  it("tells the caller nothing about the cause, but gives an id to quote", async () => {
    const { app } = await failingApi();
    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${fakeToken("someone", "someone@example.com")}` },
    });
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body).toMatchObject({ error: "internal", message: "Something went wrong" });
    expect(body.requestId).toBe(response.headers["x-request-id"]);
    expect(response.body).not.toContain("hunter2");
    await app.close();
  });

  it("hands the error to the reporter with the request it came from, and no credentials", async () => {
    const { app, reports } = await failingApi();
    await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${fakeToken("someone", "someone@example.com")}` },
    });
    expect(reports).toHaveLength(1);
    expect(String(reports[0]?.error)).toContain("secret internal detail");
    expect(reports[0]?.context).toMatchObject({ method: "GET", route: "/api/me", userId: null });
    expect(JSON.stringify(reports[0]?.context)).not.toContain("someone@example.com");
    await app.close();
  });

  it("logs a structured line for it and never writes the bearer token", async () => {
    const { app, logs } = await failingApi();
    await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${fakeToken("someone", "someone@example.com")}` },
    });
    await app.close();
    const records = logs.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records.some((record) => record.msg === "unhandled error" && record.level === 50)).toBe(
      true,
    );
    expect(logs.lines.join("")).not.toContain("test:someone");
    expect(logs.lines.join("")).toContain("requestId");
  });

  it("does not report expected failures: a bad token, a bad body, a missing thing", async () => {
    const reports: unknown[] = [];
    const base = await createTestApi({ reporter: { report: (error) => reports.push(error) } });
    api = base;
    await base.request("GET", "/api/me");
    await base.request("PUT", "/api/me/settings", { user: "u1", body: { nope: true } });
    await base.request("GET", "/api/skills/missing", { user: "u1" });
    expect(reports).toEqual([]);
  });
});

describe("errors reported by the browser (T-906)", () => {
  it("accepts a small, valid report without signing in, and logs it", async () => {
    const seen: unknown[] = [];
    api = await createTestApi({ onClientError: (error) => seen.push(error) });
    const response = await api.app.inject({
      method: "POST",
      url: "/api/client-errors",
      payload: {
        message: "x is not a function",
        stack: "at a\nat b",
        route: "session",
        build: "abc123",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(seen).toEqual([
      {
        message: "x is not a function",
        stack: "at a\nat b",
        route: "session",
        build: "abc123",
        kind: "error",
      },
    ]);
  });

  it("rejects reports that are empty, oversized or of an unknown kind", async () => {
    api = await createTestApi();
    const post = (payload: unknown) =>
      api!.app.inject({ method: "POST", url: "/api/client-errors", payload: payload as object });
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ message: "" })).statusCode).toBe(400);
    expect((await post({ message: "m".repeat(1001) })).statusCode).toBe(400);
    expect((await post({ message: "ok", kind: "weird" })).statusCode).toBe(400);
    expect((await post({ message: "ok", stack: "s".repeat(20_000) })).statusCode).toBe(413);
  });

  it("is rate limited much harder than the rest of the API, since anyone can call it", async () => {
    api = await createTestApi();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      statuses.push(
        (
          await api.app.inject({
            method: "POST",
            url: "/api/client-errors",
            payload: { message: `e${i}` },
          })
        ).statusCode,
      );
    }
    expect(statuses.slice(0, 20).every((status) => status === 204)).toBe(true);
    expect(statuses.slice(20).every((status) => status === 429)).toBe(true);
  });
});
