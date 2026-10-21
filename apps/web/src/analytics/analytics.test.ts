import { describe, expect, it, vi } from "vitest";
import { createAnalytics, httpAnalyticsSender } from "./analytics";
import type { AnalyticsEnvelope } from "./events";

function setup(initial: { enabled?: boolean; installId?: string | null; batchSize?: number } = {}) {
  const state = {
    enabled: initial.enabled ?? true,
    installId: initial.installId === undefined ? "install-1" : initial.installId,
  };
  const sent: AnalyticsEnvelope[] = [];
  const analytics = createAnalytics({
    send: (envelope) => sent.push(envelope),
    enabled: () => state.enabled,
    installId: () => state.installId,
    build: "test-build",
    now: () => 1000,
    ...(initial.batchSize ? { batchSize: initial.batchSize } : {}),
  });
  return { analytics, sent, state };
}

const started = { name: "hint_used", props: { exerciseId: "ex", level: 1 } } as const;

describe("analytics (T-903)", () => {
  it("drops events without consent: nothing is buffered or sent, even if consent comes later", () => {
    const { analytics, sent, state } = setup({ enabled: false });
    analytics.track(started);
    state.enabled = true;
    analytics.flush();
    expect(sent).toEqual([]);
  });

  it("does nothing without an install id", () => {
    const { analytics, sent } = setup({ installId: null });
    analytics.track(started);
    analytics.flush();
    expect(sent).toEqual([]);
  });

  it("batches events and flushes them in one envelope", () => {
    const { analytics, sent } = setup();
    analytics.track(started);
    analytics.track({ name: "skill_unlocked", props: { skillId: "s" } });
    expect(sent).toEqual([]);
    analytics.flush();
    expect(sent).toEqual([
      {
        installId: "install-1",
        build: "test-build",
        events: [
          { name: "hint_used", at: 1000, props: { exerciseId: "ex", level: 1 } },
          { name: "skill_unlocked", at: 1000, props: { skillId: "s" } },
        ],
      },
    ]);
  });

  it("flushes by itself when the batch is full", () => {
    const { analytics, sent } = setup({ batchSize: 2 });
    analytics.track(started);
    analytics.track(started);
    expect(sent).toHaveLength(1);
  });

  it("turning consent off drops what was buffered instead of sending it", () => {
    const { analytics, sent, state } = setup();
    analytics.track(started);
    state.enabled = false;
    analytics.flush();
    state.enabled = true;
    analytics.flush();
    expect(sent).toEqual([]);
  });

  it("never lets a failing sender break the caller", () => {
    const analytics = createAnalytics({
      send: () => {
        throw new Error("offline");
      },
      enabled: () => true,
      installId: () => "id",
    });
    analytics.track(started);
    expect(() => analytics.flush()).not.toThrow();
  });

  it("sends over HTTP with keepalive and swallows network errors", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    httpAnalyticsSender(
      "https://analytics.example/collect",
      fetchImpl as unknown as typeof fetch,
    )({
      installId: "id",
      events: [],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://analytics.example/collect",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
    await Promise.resolve();
  });
});
