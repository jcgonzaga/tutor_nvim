import { describe, expect, it } from "vitest";
import { evaluateAttempt } from "./evaluate";
import { evaluateGoal } from "./goal";
import { buildReplay, ghostComparison, masterRun, runOf } from "./replay";
import { simulateSolution } from "./simulate";
import { exerciseWith, play } from "./test-util";

const exercise = exerciseWith({
  solutions: [
    { sequence: 'ci"production<Esc>', classification: "optimal" },
    { sequence: 'f"lcT"production<Esc>', classification: "inefficient" },
  ],
});

describe("run of an attempt", () => {
  it("keeps the logical keys and when each was pressed, from the start", () => {
    const attempt = play(exercise, 'ci"x<Esc>', { startedAt: 1000 });
    const run = runOf(attempt);
    expect(run.keys).toEqual(["c", "i", '"', "x", "<Esc>"]);
    expect(run.times).toEqual([10, 20, 30, 40, 50]);
    expect(run.durationMs).toBe(50);
  });

  it("measures an unsolved run to its last key, and an empty one as 0", () => {
    expect(runOf(play(exercise, 'ci"x')).durationMs).toBe(40);
    expect(runOf(play(exercise, "")).durationMs).toBe(0);
  });
});

describe("basic replay (T-806)", () => {
  const attempt = simulateSolution(exercise, exercise.solutions[0]!, { stepMs: 100 });
  const frames = buildReplay(exercise, runOf(attempt));

  it("starts from the exercise's initial state and has one frame per key", () => {
    expect(frames).toHaveLength(attempt.events.length + 1);
    expect(frames[0]).toMatchObject({
      index: 0,
      key: null,
      mode: "normal",
      lines: ['const mode = "development";'],
    });
  });

  it("shows the editor after every key, ending in the solved state", () => {
    expect(frames[3]?.key).toBe('"');
    expect(frames[4]?.mode).toBe("insert");
    const last = frames[frames.length - 1]!;
    expect(last.lines).toEqual(['const mode = "production";']);
    expect(last.mode).toBe("normal");
    expect(last.atMs).toBe(attempt.events.length * 100);
  });

  it("reproduces exactly what the engine did live", () => {
    const final = attempt.state;
    const last = frames[frames.length - 1]!;
    expect(last.lines).toEqual(final.buffer.lines);
    expect(last.cursor).toEqual(final.cursor);
    expect(evaluateAttempt(exercise, attempt).success).toBe(true);
  });

  it("flags a key the engine rejected instead of hiding it", () => {
    const withTypo = buildReplay(exercise, { keys: ["z", "c", "i", '"'] });
    expect(withTypo[1]).toMatchObject({ key: "z", accepted: false });
    expect(withTypo[2]?.accepted).toBe(true);
  });

  it("replays the declared optimal solution too, and it solves the exercise", () => {
    const master = masterRun(exercise)!;
    const replay = buildReplay(exercise, master);
    const last = replay[replay.length - 1]!;
    expect(last.lines).toEqual(['const mode = "production";']);
    expect(last.atMs).toBeNull();
  });

  it("starts after the exercise's setup keys, with the undo history they made", () => {
    const withSetup = exerciseWith({
      initialState: {
        buffer: "one two three\n",
        cursor: { line: 1, column: 1 },
        setupKeys: "dwdw",
      },
      objective: { type: "buffer_equals", target: "two three\n" },
      solutions: [{ sequence: "u", classification: "optimal" }],
    });
    const replay = buildReplay(withSetup, { keys: ["u"] });
    expect(replay[0]?.lines).toEqual(["three"]);
    expect(replay[1]?.lines).toEqual(["two three"]);
  });

  it("is deterministic", () => {
    expect(buildReplay(exercise, runOf(attempt))).toEqual(frames);
  });

  it("ends on a state where the goal holds", () => {
    const solved = evaluateGoal(exercise, simulateSolution(exercise, exercise.solutions[0]!).state);
    expect(solved.met).toBe(true);
  });
});

describe("ghost comparison (T-805)", () => {
  it("puts the learner's run next to the master's", () => {
    const rows = ghostComparison(exercise, {
      keys: [...'f"lcT"production', "<Esc>"],
      durationMs: 4000,
    });
    expect(rows).toEqual([
      { label: "YOU", keys: 'f"lcT"production<Esc>', keystrokes: 17, durationMs: 4000 },
      { label: "MASTER", keys: 'ci"production<Esc>', keystrokes: 14, durationMs: null },
    ]);
  });

  it("adds the previous best when it is a different run", () => {
    const you = { keys: ["x", "x"], durationMs: 100 };
    const best = { keys: ["y"], durationMs: 50 };
    expect(ghostComparison(exercise, you, best).map((row) => row.label)).toEqual([
      "YOU",
      "MASTER",
      "YOUR BEST",
    ]);
  });

  it("does not repeat the best when the learner just matched it", () => {
    const you = { keys: ["x"], durationMs: 100 };
    expect(ghostComparison(exercise, you, you).map((row) => row.label)).toEqual(["YOU", "MASTER"]);
  });

  it("uses the shortest optimal solution as the master", () => {
    const several = exerciseWith({
      solutions: [
        { sequence: 'ci"production<Esc>', classification: "optimal" },
        { sequence: 'ci"production<Esc>', classification: "optimal" },
      ],
    });
    expect(masterRun(several)?.keys.join("")).toBe('ci"production<Esc>');
  });
});
