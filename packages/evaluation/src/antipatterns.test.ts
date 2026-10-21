import { describe, expect, it } from "vitest";
import { DEFAULT_ANTI_PATTERN_CONFIG, detectAntiPatterns } from "./antipatterns";
import { exerciseWith, play } from "./test-util";

const ALL = [
  "repeated_x",
  "excessive_hjkl",
  "arrow_keys",
  "insert_mode_navigation",
  "repeated_escape",
] as const;

/** `dd` is the optimal solution (2 keys), over a short buffer where every key is accepted. */
const exercise = exerciseWith({
  initialState: { buffer: "one\ntwo\nthree\nfour\nfive\n", cursor: { line: 1, column: 1 } },
  objective: { type: "buffer_equals", target: "two\nthree\nfour\nfive\n" },
  solutions: [{ sequence: "dd", classification: "optimal" }],
  antiPatterns: [...ALL],
});

const ids = (sequence: string, subject = exercise) =>
  detectAntiPatterns(subject, play(subject, sequence)).map((hit) => hit.id);

describe("repeated_x", () => {
  it("needs a run of consecutive x presses", () => {
    expect(ids("xxx")).toContain("repeated_x");
    expect(ids("xx")).not.toContain("repeated_x");
    expect(ids("xlxlxl")).not.toContain("repeated_x");
  });

  it("reports the run it found, for feedback and replay", () => {
    const [hit] = detectAntiPatterns(exercise, play(exercise, "jxxxxl")).filter(
      (h) => h.id === "repeated_x",
    );
    expect(hit).toEqual({ id: "repeated_x", count: 4, sequences: [1, 2, 3, 4] });
  });
});

describe("excessive_hjkl", () => {
  it("follows the task: more presses than the optimal solution has keystrokes, and at least the minimum", () => {
    expect(ids("jjj")).not.toContain("excessive_hjkl"); // below the minimum of 4
    expect(ids("jjjj")).toContain("excessive_hjkl"); // 4 > 2 keystrokes of dd
  });

  it("does not flag a task whose optimal solution is itself made of hjkl", () => {
    const navigation = exerciseWith({
      initialState: { buffer: "a\nb\nc\nd\n", cursor: { line: 1, column: 1 } },
      objective: { type: "cursor_at", line: 4, column: 1 },
      evaluation: { requireFinalNormalMode: false },
      solutions: [{ sequence: "jjj", classification: "optimal" }],
      antiPatterns: ["excessive_hjkl"],
    });
    expect(ids("jjj", navigation)).toEqual([]);
    expect(ids("jkjkjk", navigation)).toContain("excessive_hjkl");
  });

  it("only counts NORMAL mode: typing these letters as text is fine", () => {
    expect(ids("ihjklhjkl<Esc>")).not.toContain("excessive_hjkl");
  });
});

describe("arrow_keys and insert_mode_navigation", () => {
  it("flags arrow keys in any mode, even though the engine rejects them", () => {
    expect(ids("<Left>")).toEqual(["arrow_keys"]);
    expect(ids("<Down><Up>")).toContain("arrow_keys");
  });

  it("flags movement keys pressed while INSERT mode is active", () => {
    expect(ids("i<Left><Esc>")).toEqual(
      expect.arrayContaining(["arrow_keys", "insert_mode_navigation"]),
    );
    expect(ids("<Left>")).not.toContain("insert_mode_navigation");
  });
});

describe("repeated_escape", () => {
  it("needs a run of Escape presses", () => {
    expect(ids("<Esc><Esc><Esc>")).toContain("repeated_escape");
    expect(ids("<Esc><Esc>")).not.toContain("repeated_escape");
    expect(ids("<Esc>l<Esc>l<Esc>")).not.toContain("repeated_escape");
  });
});

describe("configuration and scope", () => {
  it("only looks for the anti-patterns the exercise declares", () => {
    const quiet = exerciseWith({ ...{ antiPatterns: [] } });
    expect(ids("<Left><Left>xxxx", quiet)).toEqual([]);
  });

  it("takes thresholds from configuration", () => {
    const attempt = play(exercise, "xx");
    const strict = { ...DEFAULT_ANTI_PATTERN_CONFIG, repeatedX: { minRun: 2 } };
    expect(detectAntiPatterns(exercise, attempt, strict).map((hit) => hit.id)).toEqual([
      "repeated_x",
    ]);
  });

  it("never prevents completion: it only informs", () => {
    // x x x empties "one", then dd removes the empty line: the goal is reached despite the habit.
    const attempt = play(exercise, "xxxdd");
    expect(attempt.completedAt).not.toBeNull();
    expect(detectAntiPatterns(exercise, attempt).map((hit) => hit.id)).toContain("repeated_x");
  });
});
