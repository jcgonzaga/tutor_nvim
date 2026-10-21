import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE,
  MAX_STACK,
  createErrorReporter,
  describeError,
  httpSender,
  scrub,
  type ErrorReport,
} from "./errorReporter";

const collect = (options: Partial<Parameters<typeof createErrorReporter>[0]> = {}) => {
  const sent: ErrorReport[] = [];
  const clock = { now: 1_000_000 };
  const reporter = createErrorReporter({
    send: (report) => sent.push(report),
    now: () => clock.now,
    ...options,
  });
  return { reporter, sent, clock };
};

describe("scrub", () => {
  it("removes e-mail addresses, tokens and long ids", () => {
    expect(scrub("failed for ada@example.com")).toBe("failed for [email]");
    expect(scrub("Authorization: Bearer abc.def-ghi_123")).toBe("Authorization: Bearer [token]");
    expect(scrub("jwt eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiIxIn0.c2ln here")).toBe("jwt [token] here");
    expect(scrub("user 3f2a9c1e8b7d4a6f9e0c1b2a3d4e5f60 not found")).toBe("user [id] not found");
    expect(scrub("token test:someone@example.com")).not.toContain("someone");
  });

  it("drops query strings, which carry data", () => {
    expect(scrub("GET https://api.example.com/api/me?token=secret&x=1 failed")).toBe(
      "GET https://api.example.com/api/me?[query] failed",
    );
  });

  it("leaves ordinary messages alone", () => {
    expect(scrub("Cannot read properties of undefined (reading 'lines')")).toBe(
      "Cannot read properties of undefined (reading 'lines')",
    );
  });
});

describe("describeError", () => {
  it("handles errors, strings and anything thrown", () => {
    expect(describeError(new Error("boom")).message).toBe("boom");
    expect(describeError("plain").message).toBe("plain");
    expect(describeError({ code: 7 }).message).toBe('{"code":7}');
    expect(describeError(undefined).message).toBe("undefined");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular).message).toBe("[object Object]");
  });
});

describe("the error reporter (T-906)", () => {
  it("sends a scrubbed, bounded report with the screen and the build", () => {
    const { reporter, sent } = collect({ build: "abc123", route: () => "session" });
    const error = new Error(`bad profile of ada@example.com ${"x".repeat(5000)}`);
    error.stack = `Error: boom\n    at here (${"y".repeat(9000)})`;
    reporter.report(error, "react");

    expect(sent).toHaveLength(1);
    const report = sent[0]!;
    expect(report).toMatchObject({ kind: "react", route: "session", build: "abc123" });
    expect(report.message).not.toContain("ada@example.com");
    expect(report.message.length).toBeLessThanOrEqual(MAX_MESSAGE);
    expect(report.stack?.length).toBeLessThanOrEqual(MAX_STACK);
  });

  it("collapses the same error repeated in a short time, then reports it again later", () => {
    const { reporter, sent, clock } = collect();
    for (let i = 0; i < 20; i++) reporter.report(new Error("again"), "error");
    expect(sent).toHaveLength(1);
    clock.now += 61_000;
    reporter.report(new Error("again"), "error");
    expect(sent).toHaveLength(2);
  });

  it("treats different errors, and different kinds, as different", () => {
    const { reporter, sent } = collect();
    reporter.report(new Error("a"), "error");
    reporter.report(new Error("b"), "error");
    reporter.report(new Error("a"), "unhandledrejection");
    expect(sent).toHaveLength(3);
  });

  it("caps what a page can send, so a loop cannot flood the endpoint", () => {
    const { reporter, sent } = collect({ maxReports: 5 });
    for (let i = 0; i < 100; i++) reporter.report(new Error(`distinct ${i}`), "error");
    expect(sent).toHaveLength(5);
  });

  it("never throws, even when delivery does", () => {
    const reporter = createErrorReporter({
      send: () => {
        throw new Error("network down");
      },
    });
    expect(() => reporter.report(new Error("x"), "error")).not.toThrow();
  });

  it("sends nothing but the report: no profile, no keys, no buffer", () => {
    const { reporter, sent } = collect({ route: () => "map" });
    reporter.report(new Error("x"), "error");
    expect(Object.keys(sent[0]!).sort()).toEqual(["kind", "message", "route", "stack"]);
  });
});

describe("httpSender", () => {
  it("posts JSON without waiting, and swallows failures", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const send = httpSender("https://api.example.com/api/client-errors", (async (
      url: string,
      init: RequestInit,
    ) => {
      calls.push({ url, init });
      throw new Error("offline");
    }) as unknown as typeof fetch);
    expect(() => send({ message: "m", kind: "error" })).not.toThrow();
    await Promise.resolve();
    expect(calls[0]?.url).toBe("https://api.example.com/api/client-errors");
    expect(calls[0]?.init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ message: "m", kind: "error" });
  });
});
