import {
  splitLines,
  tokenizeKeySequence,
  type Position,
  type VimMode,
} from "@tutor-nvim/vim-engine";
import { z } from "zod";

/** Version of the exercise content format. Bump with an explicit migration. */
export const EXERCISE_SCHEMA_VERSION = 1;

/** Classifications a known solution can declare (`failed` is only ever computed). */
export const SOLUTION_CLASSIFICATIONS = [
  "optimal",
  "efficient",
  "valid",
  "inefficient",
  "anti-pattern",
] as const;
export type SolutionClassification = (typeof SOLUTION_CLASSIFICATIONS)[number];

export const EXERCISE_MODES = [
  "learn",
  "imitate",
  "recall",
  "discriminate",
  "transfer",
  "rush",
  "mission",
] as const;

export const ANTI_PATTERN_IDS = [
  "repeated_x",
  "excessive_hjkl",
  "arrow_keys",
  "insert_mode_navigation",
  "repeated_escape",
] as const;

/** Stable public identifier: `vim-ci-quotes-001`. */
const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be kebab-case (a-z, 0-9, -)");

/** Stable dotted identifier: `vim.ci-quotes.basic-001`. */
const slugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/,
    "must be dot-separated lowercase segments, e.g. vim.operator.change",
  );

/** Content cursors are 1-based (line and column), as in Vim's ruler. */
const contentCursorSchema = z.strictObject({
  line: z.number().int().min(1),
  column: z.number().int().min(1),
});

const initialStateSchema = z
  .strictObject({
    buffer: z.string(),
    cursor: contentCursorSchema.default({ line: 1, column: 1 }),
    vimMode: z.enum(["normal", "insert"]).default("normal"),
  })
  .superRefine((state, ctx) => {
    const lines = splitLines(state.buffer);
    const line = lines[state.cursor.line - 1];
    if (line === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["cursor", "line"],
        message: `line ${state.cursor.line} is outside the buffer (${lines.length} lines)`,
      });
      return;
    }
    // NORMAL sits on a character (or the only column of an empty line); INSERT may sit after it.
    const maxColumn = state.vimMode === "insert" ? line.length + 1 : Math.max(line.length, 1);
    if (state.cursor.column > maxColumn) {
      ctx.addIssue({
        code: "custom",
        path: ["cursor", "column"],
        message: `column ${state.cursor.column} is outside line ${state.cursor.line} (max ${maxColumn} in ${state.vimMode} mode)`,
      });
    }
  });

const objectiveSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("buffer_equals"), target: z.string() }),
]);

const evaluationSchema = z.strictObject({
  requireFinalNormalMode: z.boolean().default(false),
});

const solutionSchema = z
  .strictObject({
    sequence: z.string().min(1),
    classification: z.enum(SOLUTION_CLASSIFICATIONS),
  })
  .superRefine((solution, ctx) => {
    try {
      tokenizeKeySequence(solution.sequence);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["sequence"],
        message: error instanceof Error ? error.message : "invalid key sequence",
      });
    }
  });

const hintSchema = z.strictObject({
  afterMs: z.number().int().min(0),
  level: z.number().int().min(1),
  text: z.string().min(1),
});

const environmentSchema = z.strictObject({
  type: z.literal("simulator"),
  profile: z.string().min(1),
});

const metadataSchema = z.strictObject({
  language: z.string().min(1).optional(),
  estimatedSeconds: z.number().int().positive().optional(),
});

export const exerciseSchema = z
  .strictObject({
    schemaVersion: z.literal(EXERCISE_SCHEMA_VERSION),
    id: idSchema,
    slug: slugSchema,
    title: z.string().min(1),
    /** Shown to the learner; falls back to the title when omitted. */
    instruction: z.string().min(1).optional(),
    skillIds: z.array(slugSchema).min(1),
    mode: z.enum(EXERCISE_MODES),
    difficulty: z.number().int().min(1).max(5),
    environment: environmentSchema.default({ type: "simulator", profile: "vim-basic-v1" }),
    initialState: initialStateSchema,
    objective: objectiveSchema,
    evaluation: evaluationSchema,
    solutions: z.array(solutionSchema).min(1),
    antiPatterns: z.array(z.enum(ANTI_PATTERN_IDS)).default([]),
    hints: z.array(hintSchema).default([]),
    metadata: metadataSchema.default({}),
  })
  .transform((exercise) => ({
    ...exercise,
    instruction: exercise.instruction ?? exercise.title,
    initialState: {
      lines: splitLines(exercise.initialState.buffer),
      // Normalization boundary: content is 1-based, the engine is 0-based.
      cursor: {
        line: exercise.initialState.cursor.line - 1,
        column: exercise.initialState.cursor.column - 1,
      } satisfies Position,
      vimMode: exercise.initialState.vimMode satisfies VimMode,
    },
    objective: {
      type: exercise.objective.type,
      targetLines: splitLines(exercise.objective.target),
    },
    solutions: exercise.solutions.map((solution) => ({
      ...solution,
      /** Canonical key tokens, ready to compare with recorded input. */
      keys: tokenizeKeySequence(solution.sequence),
    })),
  }));

/** Raw content shape (what YAML/JSON authors write). */
export type ExerciseInput = z.input<typeof exerciseSchema>;
/** Normalized exercise consumed by the engine, evaluation and UI. */
export type Exercise = z.output<typeof exerciseSchema>;
export type ExerciseSolution = Exercise["solutions"][number];
export type ExerciseObjective = Exercise["objective"];
