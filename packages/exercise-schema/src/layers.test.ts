import { describe, expect, it } from "vitest";

import { availableExercises, isExerciseAvailable } from "./layers.js";
import { parseExerciseYaml } from "./validate.js";

/** A minimal valid shell exercise; `layers` is spliced in only when the case is about layers. */
const shellExercise = (layers: string | undefined): string =>
  [
    "schemaVersion: 1",
    "kind: shell",
    "id: shell-layers-001",
    "slug: shell.layers.001",
    "title: List the folder",
    "skillIds:",
    "  - linux.shell.navigation",
    "mode: learn",
    "difficulty: 1",
    ...(layers === undefined
      ? []
      : [
          "environment:",
          "  type: simulator",
          "  profile: shell-basic-v1",
          `  layers: ${layers}`,
        ]),
    "initialState:",
    "  cwd: \"\"",
    "  files: {}",
    "objective:",
    "  type: last_output_contains",
    "  text: notes",
    "solutions:",
    '  - commands: ["ls"]',
    "    classification: optimal",
    "",
  ].join("\n");

const parse = (layers: string | undefined) => parseExerciseYaml(shellExercise(layers), "a.yaml");

describe("an exercise's tool layers (S4)", () => {
  it("keeps an exercise that declares no layer available whatever is enabled", () => {
    const exercise = parse(undefined);
    expect(exercise.environment.layers).toEqual([]);
    expect(isExerciseAvailable(exercise, new Set())).toBe(true);
    expect(isExerciseAvailable(exercise, new Set(["herdr"]))).toBe(true);
  });

  it("needs every layer the exercise declares, not just one of them", () => {
    const exercise = parse("[tmux, nvim]");
    expect(exercise.environment.layers).toEqual(["tmux", "nvim"]);
    expect(isExerciseAvailable(exercise, new Set())).toBe(false);
    expect(isExerciseAvailable(exercise, new Set(["tmux"]))).toBe(false);
    expect(isExerciseAvailable(exercise, new Set(["nvim", "tmux"]))).toBe(true);
  });

  it("hides the exercises of a disabled layer instead of failing them", () => {
    const declared = parse("[tmux]");
    const plain = parse("[tmux]");
    const other = parse(undefined);
    expect(availableExercises([declared, plain, other], new Set(["nvim"]))).toEqual([other]);
    expect(availableExercises([declared, plain, other], new Set(["tmux"]))).toEqual([
      declared,
      plain,
      other,
    ]);
  });

  it("rejects a layer id that could never be a catalog id", () => {
    expect(() => parse("[Tmux]")).toThrow(/layer/i);
    // The same layer twice would ask for nothing new, so it is a content mistake.
    expect(() => parse("[tmux, tmux]")).toThrow(/repeats a layer/);
  });
});
