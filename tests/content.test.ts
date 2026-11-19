import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkContent,
  evaluateAttempt,
  goalMet,
  simulateSolution,
  simulateWorkspaceSolution,
} from "@tutor-nvim/evaluation";
import { loadContent, parseKeymapLayers } from "@tutor-nvim/exercise-schema";
import { bufferToText } from "@tutor-nvim/vim-engine";
import { readContentInput, readKeymapInput } from "../scripts/content-fs";

const bundle = loadContent(readContentInput());

describe("content", () => {
  it("loads and cross-validates: schemas, unique ids and slugs, skill references, prerequisites", () => {
    expect(bundle.skills.length).toBeGreaterThanOrEqual(14);
    expect(bundle.exercises.length).toBeGreaterThanOrEqual(10);
  });

  it("contains the canonical M1 exercise", () => {
    expect(bundle.exercises.map((exercise) => exercise.id)).toContain("vim-ci-quotes-001");
  });

  it("executes every declared solution against the engine and finds nothing wrong", () => {
    expect(checkContent(bundle)).toEqual([]);
  });

  // The exercises whose declared solutions are key sequences: a workspace solution is a list of
  // actions, replayed by the workspace engine in the "workspace content" block below (T4).
  describe.each(
    bundle.exercises
      .filter((exercise) => exercise.kind !== "workspace")
      .map((exercise) => [exercise.slug, exercise] as const),
  )("%s", (_slug, exercise) => {
    it.each(exercise.solutions.map((solution) => [solution.sequence, solution] as const))(
      "declared solution %s succeeds with its declared classification",
      (_sequence, solution) => {
        const attempt = simulateSolution(exercise, solution);
        const evaluation = evaluateAttempt(exercise, attempt);

        expect(evaluation.success).toBe(true);
        expect(evaluation.strategy).toBe(solution.classification);
        if (
          exercise.kind === "vim" &&
          attempt.kind === "vim" &&
          exercise.objective.type === "buffer_equals"
        ) {
          expect(bufferToText(attempt.state.buffer)).toBe(
            exercise.objective.targetLines.join("\n"),
          );
        }
      },
    );
  });
});

/**
 * A workspace exercise is content like any other (T3, T4): it joins the bundle, the CI gate replays
 * its action solutions through the workspace engine, and the end state is the only thing that decides
 * success while the cost in actions decides the strategy (S5).
 */
const WORKSPACE_EXERCISE = `schemaVersion: 1
kind: workspace
id: workspace-split-001
slug: workspace.window.split-001
title: "Split the window side by side"
instruction: "Split the window side by side."
skillIds: [vim.navigation.atomic]
mode: learn
difficulty: 1
initialState:
  files:
    src/main.ts: "const mode = 'development';"
  path: src/main.ts
  cwd: /project
objective:
  type: all
  goals:
    - { type: layout, text: "side(leaf, leaf)" }
    - { type: focus, leaf: 1 }
solutions:
  - actions: [window.split-side-by-side]
    classification: optimal
  - actions: [window.split-side-by-side, window.zoom]
    classification: valid
`;

function bundleWithWorkspace(exercise = WORKSPACE_EXERCISE) {
  const content = readContentInput();
  return loadContent({
    skills: content.skills,
    exercises: [...content.exercises, { path: "exercises/workspace-split.yaml", text: exercise }],
  });
}

describe("workspace content", () => {
  it("loads through the real content bundle beside the vim and shell exercises", () => {
    const loaded = bundleWithWorkspace();
    const kinds = new Set(loaded.exercises.map((exercise) => exercise.kind));

    expect(kinds).toEqual(new Set(["shell", "vim", "workspace"]));
    expect(loaded.exercises.find((exercise) => exercise.id === "workspace-split-001")?.kind).toBe(
      "workspace",
    );
  });

  it("replays every declared workspace solution and finds nothing wrong", () => {
    expect(checkContent(bundleWithWorkspace())).toEqual([]);
  });

  it("reaches the objective with the optimal solution and grades a longer list lower", () => {
    const exercise = bundleWithWorkspace().exercises.find(
      (candidate) => candidate.id === "workspace-split-001",
    );
    if (exercise?.kind !== "workspace") throw new Error("the fixture did not load as a workspace");
    const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
    if (optimal === undefined) throw new Error("the fixture declares no optimal solution");

    const replay = simulateWorkspaceSolution(exercise, optimal);
    expect(replay.refused).toBeNull();
    expect(goalMet(exercise, replay)).toBe(true);
    expect(evaluateAttempt(exercise, replay).strategy).toBe("optimal");

    // The same end state with one action more: solved, and graded below the baseline.
    const longer = simulateWorkspaceSolution(exercise, {
      actions: [...optimal.actions, { action: "window.zoom" }],
      classification: "valid",
    });
    const evaluation = evaluateAttempt(exercise, longer);
    expect(longer.refused).toBeNull();
    expect(evaluation.success).toBe(true);
    expect(evaluation.strategy).toBe("valid");
  });
});

describe("curriculum coverage", () => {
  it("has at least one exercise for every skill", () => {
    const covered = new Set(bundle.exercises.flatMap((exercise) => exercise.skillIds));
    const uncovered = bundle.skills
      .filter((skill) => !covered.has(skill.slug))
      .map((skill) => skill.slug);
    expect(uncovered).toEqual([]);
  });

  it("spans several skills and every goal type used so far", () => {
    const skills = new Set(bundle.exercises.flatMap((exercise) => exercise.skillIds));
    expect(skills.size).toBeGreaterThanOrEqual(8);

    const goalTypes = new Set<string>();
    const collect = (objective: (typeof bundle.exercises)[number]["objective"]): void => {
      goalTypes.add(objective.type);
      if (objective.type === "all") objective.goals.forEach(collect);
    };
    bundle.exercises.forEach((exercise) => collect(exercise.objective));
    expect([...goalTypes].sort()).toEqual([
      "all",
      "buffer_equals",
      "cursor_at",
      "cwd_equals",
      "fs_matches",
      "last_output_contains",
      "last_output_equals",
      "mode_equals",
    ]);
  });

  it("gives skills with transfer exercises more than one context", () => {
    const transfer = bundle.exercises.filter((exercise) => exercise.mode === "transfer");
    const contexts = new Set(transfer.map((exercise) => exercise.metadata.language));
    expect(transfer.length).toBeGreaterThanOrEqual(3);
    expect(contexts.size).toBeGreaterThanOrEqual(3);
    expect(transfer.every((exercise) => exercise.metadata.transferTags.length > 0)).toBe(true);
  });
});

/** Keymap layers are content too (S2/S3): the catalogs live in `content/keymaps` and validate.
 */
describe("keymap catalogs", () => {
  const layers = parseKeymapLayers(readKeymapInput());
  const byId = new Map(layers.map((layer) => [layer.id, layer] as const));

  it("parses the linux shell layer", () => {
    const linux = layers.find((layer) => layer.id === "linux");
    expect(linux).toBeDefined();
    expect(linux?.owns).toEqual(["shell"]);
    expect(linux?.bindings.map((binding) => binding.action)).toContain("shell.clear-line");
    // Completion is not modelled by the shell engine, so the catalog says so instead of pretending.
    const completion = linux?.bindings.find((binding) => binding.action === "shell.complete");
    expect(completion?.notModelled).toBeTruthy();
  });

  it("parses every catalog with an id of its own", () => {
    const ids = layers.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships the nvim, tmux, tmux-omarchy and omarchy catalogs, each owning its surface", () => {
    const expected: readonly (readonly [string, readonly string[]])[] = [
      ["nvim", ["editor"]],
      ["tmux", ["multiplexer"]],
      ["tmux-omarchy", ["multiplexer"]],
      ["omarchy", ["window-manager"]],
      ["lazyvim", ["editor"]],
      ["herdr", ["multiplexer"]],
    ];
    for (const [id, owns] of expected) expect([id, byId.get(id)?.owns]).toEqual([id, owns]);
  });

  it("makes tmux-omarchy build on tmux and override only the two splits it changes", () => {
    const omarchyTmux = byId.get("tmux-omarchy");
    expect(omarchyTmux?.extends).toEqual(["tmux"]);
    expect(omarchyTmux?.prefix).toBe("C-Space");
    expect(byId.get("tmux")?.prefix).toBe("C-b");

    const overrides = (omarchyTmux?.bindings ?? []).filter((binding) => binding.override);
    expect(overrides.map((binding) => [binding.keys, binding.action])).toEqual([
      ["v", "window.split-side-by-side"],
      ["h", "window.split-stacked"],
    ]);
  });

  it("makes lazyvim add its leader bindings on top of nvim", () => {
    const lazyvim = byId.get("lazyvim");
    expect(lazyvim?.extends).toEqual(["nvim"]);
    expect(lazyvim?.leader).toBe("Space");
    expect(lazyvim?.prefix).toBeUndefined();
    const actions = (lazyvim?.bindings ?? []).map((binding) => [binding.keys, binding.action]);
    expect(actions).toContainEqual(["ff", "file.find"]);
    expect(actions).toContainEqual(["-", "window.split-stacked"]);
    expect(actions).toContainEqual(["|", "window.split-side-by-side"]);
  });

  it("keeps herdr a multiplexer of its own: its own prefix and splits, nothing inherited from tmux", () => {
    const herdr = byId.get("herdr");
    expect(herdr?.extends ?? []).toEqual([]);
    expect(herdr?.prefix).toBe("C-b");
    const actions = (herdr?.bindings ?? []).map((binding) => [binding.keys, binding.action]);
    expect(actions).toContainEqual(["v", "window.split-side-by-side"]);
    expect(actions).toContainEqual(["-", "window.split-stacked"]);
    // tmux's own split keys are not Herdr's: inheriting them would invent bindings (S3).
    expect(actions.map(([keys]) => keys)).not.toContain("%");
  });

  it("keeps the surfaces with no engine honest: every tmux, omarchy, herdr and lazyvim binding says why", () => {
    const unmarked = ["tmux", "tmux-omarchy", "omarchy", "herdr", "lazyvim"].flatMap((id) =>
      (byId.get(id)?.bindings ?? [])
        .filter((binding) => binding.notModelled === undefined)
        .map((binding) => `${id}: ${binding.keys}`),
    );
    expect(unmarked).toEqual([]);
  });

  it("marks only the nvim commands the vim engine cannot run as notModelled", () => {
    const bindings = byId.get("nvim")?.bindings ?? [];
    const namespaces = (marked: "modelled" | "not-modelled"): string[] =>
      bindings
        .filter((binding) => (binding.notModelled === undefined) === (marked === "modelled"))
        .map((binding) => binding.action.split(".")[0] as string);

    // Motions, insert transitions, operators, text objects and edits are what the engine executes.
    expect(new Set(namespaces("modelled"))).toEqual(new Set(["motion", "edit"]));
    // Files, buffers and windows do not exist in packages/vim-engine yet, so those rows must say so.
    expect(new Set(namespaces("not-modelled"))).toEqual(new Set(["file", "buffer", "window"]));
  });
});

/** Exercises are content (AGENTS.md 2.2): no application code may know a particular exercise. */
describe("no exercise-specific application code", () => {
  const webSource = fileURLToPath(new URL("../apps/web/src", import.meta.url));

  function* sources(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) yield* sources(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) yield path;
    }
  }

  it("never mentions an exercise id or slug", () => {
    const identifiers = bundle.exercises.flatMap((exercise) => [exercise.id, exercise.slug]);
    const offenders = [...sources(webSource)].flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return identifiers
        .filter((identifier) => text.includes(identifier))
        .map((id) => `${file}: ${id}`);
    });
    expect(offenders).toEqual([]);
  });
});
