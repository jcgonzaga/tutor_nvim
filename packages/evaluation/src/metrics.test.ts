import { describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_CONFIG, evaluateAttempt } from "./evaluate";
import { DEFAULT_METRICS_CONFIG } from "./metrics";
import { exerciseWith, play } from "./test-util";

const exercise = exerciseWith({
  initialState: { buffer: "one two three\n", cursor: { line: 1, column: 1 } },
  objective: { type: "buffer_equals", target: "two three\n" },
  evaluation: { requireFinalNormalMode: false },
  solutions: [{ sequence: "dw", classification: "optimal" }],
});

const metricsFor = (sequence: string, timestamps?: number[], startedAt = 0) =>
  evaluateAttempt(
    exercise,
    play(exercise, sequence, { startedAt, ...(timestamps ? { timestamps } : {}) }),
  ).metrics;

describe("metrics v1", () => {
  it("scores a clean, fast run at 100 everywhere", () => {
    expect(metricsFor("dw", [200, 250])).toMatchObject({
      success: true,
      accuracyScore: 100,
      strategyScore: 100,
      efficiencyScore: 100,
      fluencyScore: 100,
      independenceScore: 100,
      performanceScore: 100,
      errors: 0,
      unnecessaryKeystrokes: 0,
      hintsUsed: 0,
    });
  });

  it("zeroes every score of an unsolved attempt: never reward fast incorrect behavior", () => {
    const metrics = metricsFor("l", [100]);
    expect(metrics).toMatchObject({
      success: false,
      accuracyScore: 0,
      efficiencyScore: 0,
      fluencyScore: 0,
      independenceScore: 0,
      performanceScore: 0,
    });
  });

  it("counts rejected inputs as errors and lowers accuracy", () => {
    // 2 rejected keys + dw (2 accepted): 2 of 4 inputs accepted.
    const metrics = metricsFor("zzdw");
    expect(metrics.errors).toBe(2);
    expect(metrics.accuracyScore).toBe(50);
    expect(metrics.unnecessaryKeystrokes).toBe(2);
  });

  it("derives fluency from first-input, median and maximum latency", () => {
    // first input after 2200 ms (halfway between 400 and 4000): the first-input part scores 50.
    // One inter-key gap of 75 ms is inside the ideal band for both median and max: 100 each.
    const metrics = metricsFor("dw", [2200, 2275]);
    expect(metrics.firstInputLatencyMs).toBe(2200);
    expect(metrics.medianInterKeyLatencyMs).toBe(75);
    expect(metrics.maxInterKeyLatencyMs).toBe(75);
    // 0.4 * 50 + 0.3 * 100 + 0.3 * 100 = 80
    expect(metrics.fluencyScore).toBeCloseTo(80, 10);
  });

  it("uses the first-input latency alone when there are no inter-key gaps", () => {
    const single = exerciseWith({
      initialState: { buffer: "abc\n", cursor: { line: 1, column: 1 } },
      objective: { type: "buffer_equals", target: "bc\n" },
      evaluation: { requireFinalNormalMode: false },
      solutions: [{ sequence: "x", classification: "optimal" }],
    });
    const { metrics } = evaluateAttempt(single, play(single, "x", { timestamps: [200] }));
    expect(metrics.medianInterKeyLatencyMs).toBeNull();
    expect(metrics.maxInterKeyLatencyMs).toBeNull();
    expect(metrics.fluencyScore).toBe(100);
  });

  it("takes the median of the gaps between inputs, for odd and even counts", () => {
    // Only the gaps matter here, not whether the attempt succeeds.
    expect(metricsFor("lhdw", [100, 200, 400, 800]).medianInterKeyLatencyMs).toBe(200); // 100, 200, 400
    expect(metricsFor("lhlhdw", [100, 200, 400, 800, 1600, 3200]).medianInterKeyLatencyMs).toBe(
      400,
    ); // five gaps
    expect(metricsFor("lhldw", [100, 200, 400, 800, 1600]).medianInterKeyLatencyMs).toBe(300); // 200 and 400 average
  });

  it("scales fluency by accuracy, so speed counts only in proportion to clean execution", () => {
    const clean = metricsFor("dw", [100, 150]);
    const sloppy = metricsFor("zzdw", [100, 150, 200, 250]);
    expect(clean.fluencyScore).toBe(100);
    expect(sloppy.accuracyScore).toBe(50);
    expect(sloppy.fluencyScore).toBe(50);
  });

  it("takes hints off the independence score", () => {
    const attempt = play(exercise, "dw", { timestamps: [100, 150] });
    const hinted = {
      ...attempt,
      hints: [
        { level: 1, timestamp: 50 },
        { level: 2, timestamp: 60 },
      ],
    };
    const { metrics } = evaluateAttempt(exercise, hinted);
    expect(metrics.hintsUsed).toBe(2);
    expect(metrics.independenceScore).toBe(100 - 2 * DEFAULT_METRICS_CONFIG.hintPenalty);
    expect(metrics.performanceScore).toBeLessThan(100);
  });

  it("combines the components with configurable weights", () => {
    const attempt = play(exercise, "lhdw", { timestamps: [100, 150, 200, 250] });
    const { metrics } = evaluateAttempt(exercise, attempt);
    const w = DEFAULT_METRICS_CONFIG.weights;
    const expected =
      metrics.accuracyScore * w.accuracy +
      metrics.strategyScore * w.strategy +
      metrics.efficiencyScore * w.efficiency +
      metrics.fluencyScore * w.fluency +
      metrics.independenceScore * w.independence;
    expect(metrics.performanceScore).toBeCloseTo(expected, 10);

    const accuracyOnly = {
      ...DEFAULT_EVALUATION_CONFIG,
      metrics: {
        ...DEFAULT_METRICS_CONFIG,
        weights: { accuracy: 1, strategy: 0, efficiency: 0, fluency: 0, independence: 0 },
      },
    };
    expect(evaluateAttempt(exercise, attempt, accuracyOnly).metrics.performanceScore).toBe(
      metrics.accuracyScore,
    );
  });

  it("measures duration to the completing input and is deterministic", () => {
    const first = metricsFor("dw", [1200, 1500], 1000);
    expect(first.totalDurationMs).toBe(500);
    expect(first.firstInputLatencyMs).toBe(200);
    expect(metricsFor("dw", [1200, 1500], 1000)).toEqual(first);
  });
});
