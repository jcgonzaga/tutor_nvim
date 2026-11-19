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
 * `path` where the action names a file (`file.open`, `file.new`, `buffer.list`, T4b/T5c), `text`
 * where it types one (`edit.insert`, L9), `query` where it searches the project (`file.find`,
 * `grep.project`, T5c), `command` where it runs one (`shell.run`, T7a1) and `tab` where it moves the
 * focused window between tabs (`workspace.move`, T7a2).
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
  /**
   * The terminal window this exercise may open (T7a1, S6): its title, where it opens and what the
   * simulated machine prints for each command. The outputs are content because there is no process
   * to ask, so `shell.run` can only append what a file declared and refuses a command nobody did.
   */
  terminal: z
    .strictObject({
      title: z.string().min(1),
      /** Where it opens; omitted means the workspace's own cwd. */
      cwd: z.string().optional(),
      /** command -> the lines it prints, in the order it prints them. */
      commands: z.record(z.string(), z.array(z.string())),
    })
    .optional(),
});

/** What content writes for the terminal, before `terminalSpec` normalizes it. */
type RawTerminalSpec = z.input<typeof initialStateSchema>["terminal"];

/** The terminal shape the engine reads: `cwd` is `null` and not absent when the content omits it. */
export interface WorkspaceTerminalSpec {
  readonly title: string;
  readonly cwd: string | null;
  readonly commands: Readonly<Record<string, readonly string[]>>;
}

export type RawWorkspaceObjective =
  | { type: "active_file"; path: string }
  | { type: "open_buffers"; paths: string[] }
  | { type: "buffer_text"; path: string; text: string }
  | { type: "file_text"; path: string; text: string }
  | { type: "layout"; text: string }
  | { type: "focus"; leaf: number }
  | { type: "split_ratio"; index: number; ratio: number }
  | { type: "windows"; paths: string[] }
  | { type: "zoom"; path: string | null }
  | { type: "terminal_output"; lines: string[] }
  | { type: "session"; state: "attached" | "detached" }
  | { type: "mode"; mode: "normal" | "resize" }
  | { type: "grep_matches"; matches: WorkspaceGrepMatch[] }
  | { type: "all"; goals: RawWorkspaceObjective[] };

/**
 * One row a project search found: the file, its line (from 1) and the line's text. Content writes the
 * rows `grep.project` records, in the order the engine records them, so the objective is a fact
 * about the project rather than a pattern the evaluator has to search for again.
 */
export interface WorkspaceGrepMatch {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

const grepMatchSchema = z.strictObject({
  path: diskPathSchema,
  /** Lines count from 1, the way `grep -n` prints them. */
  line: z.number().int().min(1),
  text: z.string(),
});
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
    /** The paths the leaves show, in pre-order: one entry per window (T6). */
    z.strictObject({ type: z.literal("windows"), paths: z.array(diskPathSchema).min(1) }),
    /** The path the zoomed window shows, or `null` when nothing is zoomed (T6). */
    z.strictObject({ type: z.literal("zoom"), path: diskPathSchema.nullable() }),
    /**
     * Whether the session is attached or detached (T7a2): the freeze `session.detach` sets and
     * `session.attach` clears. The two words are the whole goal, because what a story asserts about
     * story 20 is that the learner is in the session or out of it, never a layout inside it.
     */
    z.strictObject({
      type: z.literal("session"),
      state: z.enum(["attached", "detached"]),
    }),
    /**
     * The input mode (T7a2): "widen a window in resize mode, then leave it" ends in `normal` with the
     * wider ratio, so the mode is asserted next to the `split_ratio` that records the widening.
     */
    z.strictObject({ type: z.literal("mode"), mode: z.enum(["normal", "resize"]) }),
    /**
     * The lines the focused terminal printed (T7a1): written as lines, normalized like `buffer_text`,
     * so a story says what a command printed even when it printed nothing at all.
     */
    z.strictObject({
      type: z.literal("terminal_output"),
      lines: z.array(z.string()).min(1),
    }),
    /** The rows `grep.project` recorded, in project order: path first, then line (T5c). */
    z.strictObject({
      type: z.literal("grep_matches"),
      matches: z.array(grepMatchSchema).min(1),
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
  | { readonly type: "windows"; readonly paths: readonly string[] }
  | { readonly type: "zoom"; readonly path: string | null }
  | { readonly type: "terminal_output"; readonly targetLines: readonly string[] }
  | { readonly type: "session"; readonly state: "attached" | "detached" }
  | { readonly type: "mode"; readonly mode: "normal" | "resize" }
  | { readonly type: "grep_matches"; readonly matches: readonly WorkspaceGrepMatch[] }
  | { readonly type: "all"; readonly goals: readonly WorkspaceObjective[] };

/**
 * The declared terminal as the engine reads it, or `null`: an omitted `cwd` becomes `null` so the
 * field says "the workspace's cwd" instead of vanishing from the state a replay starts from.
 */
function terminalSpec(raw: RawTerminalSpec): WorkspaceTerminalSpec | null {
  if (raw === undefined) return null;
  return { title: raw.title, cwd: raw.cwd ?? null, commands: raw.commands };
}

function normalizeObjective(raw: RawWorkspaceObjective): WorkspaceObjective {
  switch (raw.type) {
    case "buffer_text":
    case "file_text":
      // Same normalization boundary as `buffer_equals`: content is text, the comparison is lines.
      return { type: raw.type, path: raw.path, targetLines: splitLines(raw.text) };
    case "terminal_output":
      // The same boundary for what a command printed: content may write a whole scrollback as one
      // string, and the comparison is still lines against lines (T7a1).
      return { type: "terminal_output", targetLines: raw.lines.flatMap(splitLines) };
    case "open_buffers":
      // A set: the order content lists the open buffers in is not the point.
      return { type: "open_buffers", paths: [...new Set(raw.paths)].sort() };
    case "session":
      // Nothing to normalize: the two words are the goal, and a state the schema already narrowed.
      return { type: "session", state: raw.state };
    case "mode":
      return { type: "mode", mode: raw.mode };
    case "grep_matches":
      // The order *is* the point here: project order is what the engine records, and a reordering
      // would hide a search that answered rows the story never asked for.
      return {
        type: "grep_matches",
        matches: raw.matches.map((match) => ({
          path: match.path,
          line: match.line,
          text: match.text,
        })),
      };
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
      // Carried as `null` when undeclared: "may open a terminal" is a fact the state always holds,
      // and an absent field would make the engine guess (T7a1).
      terminal: terminalSpec(exercise.initialState.terminal),
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
              ...(entry.text === undefined ? {} : { text: entry.text }),
              ...(entry.query === undefined ? {} : { query: entry.query }),
              ...(entry.command === undefined ? {} : { command: entry.command }),
              ...(entry.tab === undefined ? {} : { tab: entry.tab }),
            },
      ),
    })),
  }));

/**
 * One action of a workspace solution: the target only where the vocabulary takes one, the path only
 * where the action names a file (`file.open`, `file.new`, `buffer.list`), the text only where it
 * types one (`edit.insert`), the query only where it searches the project (`file.find`,
 * `grep.project`), the command only where it runs one (`shell.run`) and the tab only where it moves a
 * window between tabs (`workspace.move`), so the replay can hand them to the engine instead of
 * guessing which file, which words, which fragment, which command or which workspace the story meant.
 */
export interface WorkspaceSolutionAction {
  readonly action: KeymapAction;
  readonly target?: KeymapTarget;
  readonly path?: string;
  /** What `edit.insert` types, handed to the engine the way `path` is. */
  readonly text?: string;
  /** What `file.find` and `grep.project` search for, handed to the engine the way `path` is. */
  readonly query?: string;
  /** What `shell.run` runs in the focused terminal, handed to the engine the way `path` is. */
  readonly command?: string;
  /** The tab `workspace.move` moves the focused window into, handed to the engine the same way. */
  readonly tab?: string;
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
