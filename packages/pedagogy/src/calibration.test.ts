import { describe, expect, it } from "vitest";
import {
  CALIBRATION_LADDER,
  EXPERIENCE_LEVELS,
  calibrationResult,
  isCalibrationDone,
  nextRung,
  pickCalibrationExercise,
  placedSkills,
  recordRung,
  startCalibration,
  type CalibrationState,
  type ExperienceLevel,
} from "./calibration";
import { exerciseFor, skillOf } from "./test-util";

/** Runs the staircase against a learner who passes exactly the rungs for which `passes(rung)`. */
function run(experience: ExperienceLevel, passes: (rung: number) => boolean) {
  let state = startCalibration(experience);
  const probed: number[] = [];
  for (let step = 0; step < 20; step++) {
    const rung = nextRung(state);
    if (rung === null) return { state, probed };
    probed.push(rung);
    state = recordRung(state, rung, passes(rung));
  }
  throw new Error("calibration did not terminate");
}

describe("calibration start", () => {
  it("probes first the rung that matches the reported experience", () => {
    const start = (experience: ExperienceLevel) => nextRung(startCalibration(experience));
    expect(EXPERIENCE_LEVELS.map(start)).toEqual([0, 1, 2, 3]);
  });

  it("covers hjkl, mode switch, word movement and operators", () => {
    expect(CALIBRATION_LADDER.map((rung) => rung.topic)).toEqual([
      "hjkl",
      "mode switch",
      "word movement",
      "operator",
    ]);
  });
});

describe("the staircase", () => {
  it("goes up after a pass and stops at the top", () => {
    const { probed, state } = run("never", () => true);
    expect(probed).toEqual([0, 1, 2, 3]);
    expect(calibrationResult(state).placedRung).toBe(3);
  });

  it("stops as soon as the boundary is known: a pass directly under a failure", () => {
    const { probed, state } = run("occasional", (rung) => rung <= 1);
    expect(probed).toEqual([2, 1]); // fail at 2, pass at 1: no need to look further
    expect(calibrationResult(state).placedRung).toBe(1);
  });

  it("takes one probe for an expert who passes the hardest rung", () => {
    const { probed, state } = run("regular", () => true);
    expect(probed).toEqual([3]);
    expect(calibrationResult(state).placedRung).toBe(3);
  });

  it("walks down after failures until something is passed", () => {
    const { probed, state } = run("regular", (rung) => rung === 0);
    expect(probed).toEqual([3, 2, 1, 0]);
    expect(calibrationResult(state).placedRung).toBe(0);
  });

  it("places a learner who fails everything below the first rung", () => {
    const { probed, state } = run("basics", () => false);
    expect(probed).toEqual([1, 0]);
    expect(calibrationResult(state).placedRung).toBe(-1);
  });

  it("never probes a rung twice and never runs past the ladder (every pass/fail pattern)", () => {
    for (const experience of EXPERIENCE_LEVELS) {
      for (let pattern = 0; pattern < 2 ** CALIBRATION_LADDER.length; pattern++) {
        const { probed } = run(experience, (rung) => ((pattern >> rung) & 1) === 1);
        expect(new Set(probed).size).toBe(probed.length);
        expect(probed.every((rung) => rung >= 0 && rung < CALIBRATION_LADDER.length)).toBe(true);
      }
    }
  });

  it("experience only chooses where to start: a consistent learner is placed the same either way", () => {
    for (let ability = -1; ability < CALIBRATION_LADDER.length; ability++) {
      const placed = EXPERIENCE_LEVELS.map(
        (experience) =>
          calibrationResult(run(experience, (rung) => rung <= ability).state).placedRung,
      );
      expect(placed).toEqual([ability, ability, ability, ability]);
    }
  });

  it("is deterministic", () => {
    const first = run("basics", (rung) => rung !== 2);
    expect(run("basics", (rung) => rung !== 2)).toEqual(first);
  });

  it("is done exactly when there is no rung left to probe", () => {
    let state: CalibrationState = startCalibration("never");
    expect(isCalibrationDone(state)).toBe(false);
    state = recordRung(state, 0, false);
    expect(isCalibrationDone(state)).toBe(true);
  });

  it("rejects rungs outside the ladder", () => {
    expect(() => recordRung(startCalibration("never"), 9, true)).toThrow(RangeError);
  });
});

describe("the initial estimate", () => {
  it("separates tested outcomes from assumptions below the highest pass", () => {
    const { state } = run("occasional", (rung) => rung <= 2);
    expect(calibrationResult(state).rungs.map((rung) => rung.outcome)).toEqual([
      "assumed",
      "assumed",
      "passed",
      "failed",
    ]);
    expect(calibrationResult(state).probes).toBe(2);
  });

  it("marks what was never reached as untested, and keeps the experience it started from", () => {
    const { state } = run("never", () => false);
    const result = calibrationResult(state);
    expect(result.rungs.map((rung) => rung.outcome)).toEqual([
      "failed",
      "untested",
      "untested",
      "untested",
    ]);
    expect(result.experience).toBe("never");
  });
});

describe("picking a probe exercise", () => {
  const skills = [
    skillOf("vim.a"),
    skillOf("vim.b", ["vim.a"], 2),
    skillOf("vim.c", ["vim.b"], 3),
    skillOf("vim.x"),
  ];

  it("takes the easiest exercise of the skill, breaking ties by id", () => {
    const exercises = [
      exerciseFor("ex-b-hard", ["vim.b"], { difficulty: 4 }),
      exerciseFor("ex-b-2", ["vim.b"], { difficulty: 1 }),
      exerciseFor("ex-b-1", ["vim.b"], { difficulty: 1 }),
    ];
    expect(pickCalibrationExercise(skills, exercises, "vim.b")?.id).toBe("ex-b-1");
  });

  it("only uses exercises built from the skill and what it builds on", () => {
    const exercises = [
      exerciseFor("ex-b-with-dependent", ["vim.b", "vim.c"], { difficulty: 1 }),
      exerciseFor("ex-b-with-unrelated", ["vim.b", "vim.x"], { difficulty: 1 }),
      exerciseFor("ex-b-with-ancestor", ["vim.b", "vim.a"], { difficulty: 3 }),
    ];
    expect(pickCalibrationExercise(skills, exercises, "vim.b")?.id).toBe("ex-b-with-ancestor");
  });

  it("returns null when content has nothing suitable", () => {
    expect(pickCalibrationExercise(skills, [exerciseFor("ex-a", ["vim.a"])], "vim.b")).toBeNull();
  });
});

describe("placement", () => {
  const ladder = [
    { topic: "first", skillId: "vim.a" },
    { topic: "second", skillId: "vim.b" },
    { topic: "third", skillId: "vim.c" },
  ];
  const skills = [
    skillOf("vim.a"),
    skillOf("vim.b", ["vim.a"], 2),
    skillOf("vim.c", ["vim.b"], 3),
    skillOf("vim.x"),
  ];
  const result = (passes: (rung: number) => boolean) =>
    calibrationResult(
      [0, 1, 2].reduce(
        (state, rung) =>
          state.results[rung] === null ? recordRung(state, rung, passes(rung)) : state,
        startCalibration("never", 3),
      ),
      ladder,
    );

  it("includes everything up to the highest pass, tested or assumed, and what it builds on", () => {
    const calibrated = calibrationResult(
      recordRung(startCalibration("regular", 3), 2, true),
      ladder,
    );
    expect(placedSkills(skills, calibrated)).toEqual(["vim.a", "vim.b", "vim.c"]);
  });

  it("stops at the first failure and ignores unrelated skills", () => {
    expect(
      placedSkills(
        skills,
        result((rung) => rung === 0),
      ),
    ).toEqual(["vim.a"]);
  });

  it("is empty when nothing was passed", () => {
    expect(
      placedSkills(
        skills,
        result(() => false),
      ),
    ).toEqual([]);
  });
});
