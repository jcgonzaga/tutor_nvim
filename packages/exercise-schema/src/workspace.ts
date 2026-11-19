import { splitLines } from "@tutor-nvim/vim-engine";
import { z } from "zod";

import { workspaceActionRefSchema, type ActionSolution } from "./action-solutions";
import { KEYMAP_ACTIONS } from "./keymap-vocabulary";
import type { KeymapAction, KeymapTarget } from "./keymap-vocabulary";
import {
  difficultySchema,
  environmentSchema,
  explanationSchema,
  idSchema,
  slugSchema,
} from "./primitives";
import {
  EXERCISE_MODES,
  EXERCISE_SCHEMA_VERSION,
  SOLUTION_CLASSIFICATIONS,
  hintsSchema,
  metadataSchema,
} from "./schema";
import { ExerciseValidationError, formatIssues, parseYamlDocument } from "./validate";

/*
 * A workspace exercise: the end state of the simulated workspace (S1, S2), never a keystroke.
 *
 * Objectives assert what is on screen — the active file, the open buffers, the buffer and disk text,
 * the layout, the focus and a split's ratio — and solutions are lists of keymap actions, so tmux's
 * `C-b %` and Herdr's `C-b v` can both solve a split (S5). This module makes a workspace exercise
 * expressible; replaying those actions and classifying the strategy belongs to `@tutor-nvim/evaluation`
 * (T4), and the CI gate runs it (AGENTS.md 10).
 */

/**
 * The actions of one solution: a name, or `{ action, target }` where the verb takes a text object,
 * and `path` where the action names a file (`file.open`, `file.new`, T4b).
 */
const solutionActionSchema = z.union([z.enum(KEYMAP_ACTIONS), workspaceActionRefSchema]);

/** A path on the simulated disk, used verbatim: the workspace resolves nothing (T1). */
const diskPathSchema = z.string().min(1);

const initialStateSchema = z.strictObject({
  /** The simulated disk: path -> text. Nothing here touches a real filesystem. */
  files: z.record(z.string(), z.string()).default({}),
  /** The file the workspace opens first; a path that is not on disk opens empty (T1). */
  path: diskPathSchema,
  /** Where a shell command would run. Absolute in content, e.g. `/project`. */
  cwd: z.string().default(""),
});

export type RawWorkspaceObjective =
  | { type: "active_file"; path: string }
  | { type: "open_buffers"; paths: string[] }
  | { type: "buffer_text"; path: string; text: string }
  | { type: "file_text"; path: string; text: string }
  | { type: "layout"; text: string }
  | { type: "focus"; leaf: number }
  | { type: "split_ratio"; index: number; ratio: number }
  | { type: "all"; goals: RawWorkspaceObjective[] };

const workspaceObjectiveSchema: z.ZodType<RawWorkspaceObjective> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("active_file"), path: diskPathSchema }),
    z.strictObject({ type: z.literal("open_buffers"), paths: z.array(diskPathSchema).min(1) }),
    z.strictObject({ type: z.literal("buffer_text"), path: diskPathSchema, text: z.string() }),
    z.strictObject({ type: z.literal("file_text"), path: diskPathSchema, text: z.string() }),
    /** What `layoutText` prints for the tree, e.g. `side(leaf, stacked(leaf, leaf))` (T3 design). */
    z.strictObject({ type: z.literal("layout"), text: z.string().min(1) }),
    /** Pre-order index of the focused leaf, counting from 0. */
    z.strictObject({ type: z.literal("focus"), leaf: z.number().int().min(0) }),
    /** Pre-order index of a split, and the share its first child takes. */
    z.strictObject({
      type: z.literal("split_ratio"),
      index: z.number().int().min(0),
      ratio: z.number().min(0).max(1),
    }),
    z.strictObject({ type: z.literal("all"), goals: z.array(workspaceObjectiveSchema).min(2) }),
  ]),
);

/** Normalized objective: text is split into lines, and open buffers are a set, not an order. */
export type WorkspaceObjective =
  | { readonly type: "active_file"; readonly path: string }
  | { readonly type: "open_buffers"; readonly paths: readonly string[] }
  | {
      readonly type: "buffer_text";
      readonly path: string;
      readonly targetLines: readonly string[];
    }
  | { readonly type: "file_text"; readonly path: string; readonly targetLines: readonly string[] }
  | { readonly type: "layout"; readonly text: string }
  | { readonly type: "focus"; readonly leaf: number }
  | { readonly type: "split_ratio"; readonly index: number; readonly ratio: number }
  | { readonly type: "all"; readonly goals: readonly WorkspaceObjective[] };

function normalizeObjective(raw: RawWorkspaceObjective): WorkspaceObjective {
  switch (raw.type) {
    case "buffer_text":
    case "file_text":
      // Same normalization boundary as `buffer_equals`: content is text, the comparison is lines.
      return { type: raw.type, path: raw.path, targetLines: splitLines(raw.text) };
    case "open_buffers":
      // A set: the order content lists the open buffers in is not the point.
      return { type: "open_buffers", paths: [...new Set(raw.paths)].sort() };
    case "all":
      return { type: "all", goals: raw.goals.map(normalizeObjective) };
    default:
      return raw;
  }
}

const solutionSchema = z.strictObject({
  /** What the learner must accomplish, in the order they do it (S5: actions, never keys). */
  actions: z.array(solutionActionSchema).min(1),
  classification: z.enum(SOLUTION_CLASSIFICATIONS),
});

export const workspaceExerciseSchema = z
  .strictObject({
    schemaVersion: z.literal(EXERCISE_SCHEMA_VERSION),
    kind: z.literal("workspace"),
    id: idSchema,
    slug: slugSchema,
    title: z.string().min(1),
    instruction: z.string().min(1).optional(),
    skillIds: z.array(slugSchema).min(1),
    mode: z.enum(EXERCISE_MODES),
    difficulty: difficultySchema,
    environment: environmentSchema.default({
      type: "simulator",
      profile: "workspace-basic-v1",
      layers: [],
    }),
    initialState: initialStateSchema,
    objective: workspaceObjectiveSchema,
    solutions: z
      .array(solutionSchema)
      .min(1)
      .refine(
        (solutions) =>
          solutions.filter((solution) => solution.classification === "optimal").length === 1,
        {
          message:
            "declare exactly one solution classified optimal (it is the efficiency baseline)",
        },
      ),
    hints: hintsSchema.default([]),
    explanation: explanationSchema.optional(),
    metadata: metadataSchema.default({ transferTags: [] }),
  })
  .transform((exercise) => ({
    ...exercise,
    actionSolutions: NO_SOLO_ACTIONS,
    instruction: exercise.instruction ?? exercise.title,
    initialState: {
      files: exercise.initialState.files,
      path: exercise.initialState.path,
      cwd: exercise.initialState.cwd,
    },
    objective: normalizeObjective(exercise.objective),
    solutions: exercise.solutions.map((solution) => ({
      classification: solution.classification,
      actions: solution.actions.map((entry): WorkspaceSolutionAction =>
        typeof entry === "string"
          ? { action: entry }
          : {
              action: entry.action,
              ...(entry.target === undefined ? {} : { target: entry.target }),
              ...(entry.path === undefined ? {} : { path: entry.path }),
            },
      ),
    })),
  }));

/**
 * One action of a workspace solution: the target only where the vocabulary takes one, and the path
 * only where the action names a file (`file.open`, `file.new`), so the replay can hand it to the
 * engine instead of guessing which file the story meant.
 */
export interface WorkspaceSolutionAction {
  readonly action: KeymapAction;
  readonly target?: KeymapTarget;
  readonly path?: string;
}

/**
 * Every exercise answers "which actions do you ask of a layer?" the same way (`planExerciseActions`
 * takes `Pick<Exercise, "actionSolutions">`). A workspace declares its actions inside each solution,
 * because their order is part of the solution, so the field is empty and content cannot write it.
 */
const NO_SOLO_ACTIONS: readonly ActionSolution[] = [];

/** Raw content shape of a workspace exercise (what YAML/JSON authors write). */
export type WorkspaceExerciseInput = z.input<typeof workspaceExerciseSchema>;
/** Normalized workspace exercise consumed by the workspace engine, evaluation and UI. */
export type WorkspaceExercise = z.output<typeof workspaceExerciseSchema>;
export type WorkspaceSolution = WorkspaceExercise["solutions"][number];

/** Validates and normalizes one workspace exercise. Throws `ExerciseValidationError`. */
export function parseWorkspaceExercise(input: unknown, source?: string): WorkspaceExercise {
  const result = workspaceExerciseSchema.safeParse(input);
  if (!result.success) throw new ExerciseValidationError(formatIssues(result.error), source);
  return result.data;
}

export function parseWorkspaceExerciseYaml(text: string, source?: string): WorkspaceExercise {
  return parseWorkspaceExercise(parseYamlDocument(text, source), source);
}
