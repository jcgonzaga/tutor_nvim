import { describe, expect, it } from "vitest";
import {
  keysForCommand,
  parseExercise,
  type ShellExercise,
  type ShellExerciseInput,
} from "@tutor-nvim/exercise-schema";
import { keyInputFromToken } from "@tutor-nvim/vim-engine";
import {
  advanceAttempt,
  checkExercise,
  describeFeedback,
  detectAntiPatterns,
  evaluateAttempt,
  evaluateShellGoal,
  giveUpAttempt,
  goalMet,
  hintStatus,
  revealHint,
  simulateSolution,
  startAttempt,
  type ShellAttempt,
} from "./index";

function shellExercise(overrides: Partial<ShellExerciseInput> = {}): ShellExercise {
  const exercise = parseExercise({
    schemaVersion: 1,
    kind: "shell",
    id: "shell-test-001",
    slug: "shell.test.basic-001",
    title: "Make a folder and go in",
    skillIds: ["linux.shell.navigation"],
    mode: "recall",
    difficulty: 2,
    initialState: { files: { "notes.txt": "hello\n", "project/src/app.js": "x\n" } },
    objective: {
      type: "all",
      goals: [
        { type: "fs_matches", dirs: ["docs"] },
        { type: "cwd_equals", path: "docs" },
      ],
    },
    solutions: [
      { commands: ["mkdir docs", "cd docs"], classification: "optimal" },
      { commands: ["mkdir docs", "cd ./docs"], classification: "valid" },
    ],
    hints: [{ afterMs: 1000, level: 1, text: "Two commands." }],
    ...overrides,
  });
  if (exercise.kind !== "shell") throw new Error("expected a shell exercise");
  return exercise;
}

/** Types commands one key at a time, 10 ms apart. */
function type(exercise: ShellExercise, commands: readonly string[], startedAt = 0): ShellAttempt {
  const keys = commands.flatMap(keysForCommand);
  return keys.reduce<ShellAttempt>(
    (attempt, token, index) =>
      advanceAttempt(exercise, attempt, {
        ...keyInputFromToken(token),
        timestamp: startedAt + (index + 1) * 10,
      }),
    startAttempt(exercise, startedAt),
  );
}

describe("a shell attempt", () => {
  it("starts in the initial tree, in the exercise's directory", () => {
    const attempt = startAttempt(
      shellExercise({ initialState: { files: { "a/b.txt": "" }, cwd: "a" } }),
      0,
    );
    expect(attempt.kind).toBe("shell");
    expect(attempt.state.cwd).toEqual(["home", "user", "a"]);
    expect(attempt.events).toEqual([]);
  });

  it("applies the declared permissions to the initial files", () => {
    const attempt = startAttempt(
      shellExercise({
        initialState: { files: { "run.sh": "echo hi\n" }, modes: { "run.sh": "600" } },
      }),
      0,
    );
    const lines = simulateSolution(shellExercise(), shellExercise().solutions[0]!);
    expect(lines.state.transcript).toHaveLength(2);
    // chmod 600 shows in `ls -l` of the real tree
    const listed = type(
      shellExercise({
        initialState: { files: { "run.sh": "echo hi\n" }, modes: { "run.sh": "600" } },
      }),
      ["ls -l run.sh"],
    );
    expect(listed.state.transcript[0]?.output).toContain("-rw-------");
    expect(attempt.state.transcript).toEqual([]);
  });

  it("records every key with the caret position and no Vim mode", () => {
    const attempt = type(shellExercise(), ["ls"]);
    expect(attempt.events.map((event) => event.logicalKey)).toEqual(["l", "s", "<CR>"]);
    expect(attempt.events.map((event) => event.mode)).toEqual(["shell", "shell", "shell"]);
    expect(attempt.events[0]?.cursorBefore).toEqual({ line: 0, column: 0 });
    expect(attempt.events[0]?.cursorAfter).toEqual({ line: 0, column: 1 });
    expect(attempt.events[2]?.cursorAfter).toEqual({ line: 0, column: 0 });
    expect(attempt.events.every((event) => event.accepted)).toBe(true);
  });

  it("is complete at the Enter that satisfies the goal, not while typing it", () => {
    const exercise = shellExercise();
    const partial = type(exercise, ["mkdir docs"]);
    expect(partial.completedAt).toBeNull();
    const done = type(exercise, ["mkdir docs", "cd docs"]);
    expect(done.completedAt).toBe(done.events[done.events.length - 1]?.timestamp);

    // Frozen afterwards: more typing changes nothing.
    const after = advanceAttempt(exercise, done, { ...keyInputFromToken("x"), timestamp: 9999 });
    expect(after).toBe(done);
  });

  it("can be given up, and then it is a failed attempt", () => {
    const exercise = shellExercise();
    const gaveUp = giveUpAttempt(type(exercise, ["ls"]), 500);
    expect(gaveUp.completedAt).toBe(500);
    const evaluation = evaluateAttempt(exercise, gaveUp);
    expect(evaluation.success).toBe(false);
    expect(evaluation.strategy).toBe("failed");
    expect(evaluation.metrics.performanceScore).toBe(0);
  });

  it("refuses to judge a Vim attempt with a shell exercise", () => {
    const attempt = startAttempt(shellExercise(), 0);
    const vim = { ...attempt, kind: "vim" } as never;
    expect(() => goalMet(shellExercise(), vim)).toThrow(/cannot be judged/);
  });

  it("reveals timed hints like any other attempt", () => {
    const exercise = shellExercise();
    const attempt = startAttempt(exercise, 0);
    expect(revealHint(exercise, attempt, 500)).toBe(attempt);
    const shown = revealHint(exercise, attempt, 1500);
    expect(hintStatus(exercise, shown).revealed).toHaveLength(1);
    expect(shown.kind).toBe("shell");
  });
});

describe("shell goals", () => {
  const attemptAfter = (exercise: ShellExercise, commands: readonly string[]) =>
    type(exercise, commands);

  it("checks file contents, directories, absence and permissions", () => {
    const exercise = shellExercise({
      initialState: { files: { "a.txt": "x\n", "run.sh": "echo\n" } },
      objective: {
        type: "fs_matches",
        files: { "b.txt": "x\n" },
        dirs: ["d"],
        absent: ["a.txt"],
        modes: { "run.sh": "755" },
      },
    });
    const goal = (commands: readonly string[]) =>
      evaluateShellGoal(exercise, attemptAfter(exercise, commands).state).met;
    expect(goal(["mv a.txt b.txt", "mkdir d", "chmod 755 run.sh"])).toBe(true);
    expect(goal(["cp a.txt b.txt", "mkdir d", "chmod 755 run.sh"])).toBe(false); // a.txt still there
    expect(goal(["mv a.txt b.txt", "mkdir d", "chmod 700 run.sh"])).toBe(false);
    expect(goal(["mv a.txt b.txt", "chmod 755 run.sh"])).toBe(false); // no directory
    expect(goal(["mv a.txt b.txt", "mkdir d", "chmod +x run.sh"])).toBe(true);
  });

  it("compares file content exactly", () => {
    const exercise = shellExercise({
      initialState: { files: {} },
      objective: { type: "fs_matches", files: { "a.txt": "hi\n" } },
      solutions: [{ commands: ["echo hi > a.txt"], classification: "optimal" }],
    });
    expect(goalMet(exercise, type(exercise, ["echo hi > a.txt"]))).toBe(true);
    expect(goalMet(exercise, type(exercise, ["echo -n hi > a.txt"]))).toBe(false);
  });

  it("reads the directory the learner is in, relative to home", () => {
    const exercise = shellExercise({
      objective: { type: "cwd_equals", path: "project/src" },
      solutions: [{ commands: ["cd project/src"], classification: "optimal" }],
    });
    expect(goalMet(exercise, type(exercise, ["cd project/src"]))).toBe(true);
    expect(goalMet(exercise, type(exercise, ["cd project"]))).toBe(false);
    const home = shellExercise({
      objective: { type: "cwd_equals", path: "" },
      initialState: { files: { "a/b": "" }, cwd: "a" },
    });
    expect(goalMet(home, type(home, ["cd"]))).toBe(true);
  });

  it("looks at the output of the last command", () => {
    const equals = shellExercise({
      objective: { type: "last_output_equals", text: "/home/user\n" },
      solutions: [{ commands: ["pwd"], classification: "optimal" }],
    });
    expect(goalMet(equals, type(equals, ["pwd"]))).toBe(true);
    expect(goalMet(equals, type(equals, ["ls"]))).toBe(false);
    expect(goalMet(equals, type(equals, ["ls", "pwd"]))).toBe(true);

    const contains = shellExercise({
      objective: { type: "last_output_contains", text: "app.js" },
      solutions: [{ commands: ["find . -name app.js"], classification: "optimal" }],
    });
    expect(goalMet(contains, type(contains, ["find . -name app.js"]))).toBe(true);
    expect(goalMet(contains, type(contains, ["ls"]))).toBe(false);
  });
});

describe("shell strategy, metrics and feedback", () => {
  const exercise = shellExercise();

  it("keeps success and strategy apart, as for Vim", () => {
    const optimal = evaluateAttempt(exercise, type(exercise, ["mkdir docs", "cd docs"]));
    expect(optimal).toMatchObject({ success: true, strategy: "optimal" });
    const declaredValid = evaluateAttempt(exercise, type(exercise, ["mkdir docs", "cd ./docs"]));
    expect(declaredValid).toMatchObject({ success: true, strategy: "valid" });
    const wandering = evaluateAttempt(
      exercise,
      type(exercise, ["ls", "pwd", "ls -a", "mkdir docs", "cd docs"]),
    );
    expect(wandering.success).toBe(true);
    expect(["inefficient", "valid"]).toContain(wandering.strategy);
  });

  it("counts a failed command as an error whose keys were wasted", () => {
    const clean = evaluateAttempt(exercise, type(exercise, ["mkdir docs", "cd docs"])).metrics;
    const typo = evaluateAttempt(
      exercise,
      type(exercise, ["mkdri docs", "mkdir docs", "cd docs"]),
    ).metrics;
    expect(clean.errors).toBe(0);
    expect(clean.accuracyScore).toBe(100);
    expect(typo.errors).toBe(1);
    expect(typo.accuracyScore).toBeLessThan(100);
    // "mkdri docs" + Enter = 11 keys of 30
    expect(typo.accuracyScore).toBeCloseTo((100 * (30 - 11)) / 30, 5);
    expect(typo.performanceScore).toBeLessThan(clean.performanceScore);
    expect(typo.keystrokes).toBe(30);
  });

  it("measures efficiency against the shortest optimal solution", () => {
    const metrics = evaluateAttempt(exercise, type(exercise, ["mkdir docs", "cd docs"])).metrics;
    expect(metrics.keystrokes).toBe(
      keysForCommand("mkdir docs").length + keysForCommand("cd docs").length,
    );
    expect(metrics.unnecessaryKeystrokes).toBe(0);
    expect(metrics.efficiencyScore).toBe(100);
  });

  it("describes the run in key notation and offers the better way", () => {
    const perfect = describeFeedback(
      exercise,
      type(exercise, ["mkdir docs", "cd docs"]),
      evaluateAttempt(exercise, type(exercise, ["mkdir docs", "cd docs"])),
    );
    expect(perfect.kind).toBe("perfect");
    expect(perfect.betterKeys).toBeNull();

    const attempt = type(exercise, ["mkdir docs", "cd ./docs"]);
    const completed = describeFeedback(exercise, attempt, evaluateAttempt(exercise, attempt));
    expect(completed.kind).toBe("completed");
    expect(completed.yourKeys).toBe("mkdir<Space>docs<CR>cd<Space>./docs<CR>");
    expect(completed.betterKeys).toBe("mkdir<Space>docs<CR>cd<Space>docs<CR>");
  });
});

describe("shell anti-patterns", () => {
  const detect = (commands: readonly string[], ids: ShellExercise["antiPatterns"]) => {
    const exercise = shellExercise({
      antiPatterns: ids,
      initialState: { files: { "a/b/c/d.txt": "", "x.log": "" } },
      objective: { type: "fs_matches", dirs: ["never"] },
    });
    return detectAntiPatterns(exercise, type(exercise, commands));
  };

  it("flags the same command failing again and again", () => {
    expect(
      detect(["cat nothing", "cat nothing", "cat nothing"], ["repeated_failed_command"]),
    ).toMatchObject([{ id: "repeated_failed_command", count: 3 }]);
    expect(detect(["cat nothing", "cat gone", "cat nothing"], ["repeated_failed_command"])).toEqual(
      [],
    );
    // Repeating a command that works is fine.
    expect(detect(["ls", "ls", "ls"], ["repeated_failed_command"])).toEqual([]);
  });

  it("flags a chain of cd .. where one path would do", () => {
    const hits = detect(["cd a", "cd b", "cd c", "cd ..", "cd ..", "cd .."], ["cd_up_chain"]);
    expect(hits).toMatchObject([{ id: "cd_up_chain", count: 3 }]);
    expect(detect(["cd a", "cd .."], ["cd_up_chain"])).toEqual([]);
  });

  it("flags rm -r with a wildcard, however the flags are written", () => {
    expect(detect(["rm -rf *"], ["rm_rf_wildcard"])).toMatchObject([{ id: "rm_rf_wildcard" }]);
    expect(detect(["rm -r -f a/*"], ["rm_rf_wildcard"])).toMatchObject([{ id: "rm_rf_wildcard" }]);
    expect(detect(["rm x.log"], ["rm_rf_wildcard"])).toEqual([]);
    expect(detect(["rm -rf a"], ["rm_rf_wildcard"])).toEqual([]);
  });

  it("only looks for the anti-patterns the exercise declares, and points at the keys", () => {
    expect(detect(["rm -rf *"], [])).toEqual([]);
    const [hit] = detect(["ls", "rm -rf *"], ["rm_rf_wildcard"]);
    expect(hit?.sequences).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]); // the 9 keys of the second command
  });

  it("turns a solved task into an anti-pattern strategy without blocking completion", () => {
    const exercise = shellExercise({
      antiPatterns: ["cd_up_chain"],
      initialState: { files: { "a/b/c/d.txt": "" }, cwd: "a/b/c" },
      objective: { type: "cwd_equals", path: "" },
      solutions: [{ commands: ["cd"], classification: "optimal" }],
    });
    const attempt = type(exercise, ["cd ..", "cd ..", "cd .."]);
    expect(attempt.completedAt).not.toBeNull();
    expect(evaluateAttempt(exercise, attempt)).toMatchObject({
      success: true,
      strategy: "anti-pattern",
    });
  });
});

describe("checking shell content", () => {
  it("accepts an exercise whose solutions reach the goal with the declared classification", () => {
    expect(checkExercise(shellExercise())).toEqual([]);
  });

  it("reports a solution that does not reach the objective", () => {
    const errors = checkExercise(
      shellExercise({ solutions: [{ commands: ["mkdir docs"], classification: "optimal" }] }),
    );
    expect(errors.join("\n")).toMatch(/does not reach the objective/);
  });

  it("reports an objective that already holds", () => {
    const errors = checkExercise(
      shellExercise({ objective: { type: "fs_matches", files: { "notes.txt": "hello\n" } } }),
    );
    expect(errors.join("\n")).toMatch(/already satisfied by the initial state/);
  });

  it("reports keys typed after the goal was already reached", () => {
    const errors = checkExercise(
      shellExercise({
        solutions: [{ commands: ["mkdir docs", "cd docs", "ls"], classification: "optimal" }],
      }),
    );
    expect(errors.join("\n")).toMatch(/after the objective is already reached/);
  });

  it("flags a solution blessed as good that triggers an anti-pattern the exercise warns about", () => {
    const errors = checkExercise(
      shellExercise({
        antiPatterns: ["cd_up_chain"],
        initialState: { files: { "a/b/c/d.txt": "" }, cwd: "a/b/c" },
        objective: { type: "cwd_equals", path: "" },
        solutions: [{ commands: ["cd ..", "cd ..", "cd .."], classification: "optimal" }],
      }),
    );
    expect(errors.join("\n")).toMatch(/triggers cd_up_chain/);
  });
});
