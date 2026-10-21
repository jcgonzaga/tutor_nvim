import {
  splitLines,
  tokenizeKeySequence,
  type Position,
  type VimMode,
} from "@tutor-nvim/vim-engine";
import { z } from "zod";
import { difficultySchema, idSchema, slugSchema, tagSchema } from "./primitives";

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

const vimModeSchema = z.enum(["normal", "insert"]);

/** Content cursors are 1-based (line and column), as in Vim's ruler. */
const contentCursorSchema = z.strictObject({
  line: z.number().int().min(1),
  column: z.number().int().min(1),
});

const initialStateSchema = z
  .strictObject({
    buffer: z.string(),
    cursor: contentCursorSchema.default({ line: 1, column: 1 }),
    vimMode: vimModeSchema.default("normal"),
    /**
     * Keys applied before the learner starts, keeping their undo history. Lets an
     * exercise begin with something to undo or redo; it is not part of the attempt.
     */
    setupKeys: z.string().min(1).optional(),
  })
  .superRefine((state, ctx) => {
    if (state.setupKeys !== undefined) {
      try {
        tokenizeKeySequence(state.setupKeys);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["setupKeys"],
          message: error instanceof Error ? error.message : "invalid key sequence",
        });
      }
    }
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

/** Objective as authors write it (cursors 1-based). */
export type RawObjective =
  | { type: "buffer_equals"; target: string }
  | { type: "cursor_at"; line: number; column: number }
  | { type: "mode_equals"; mode: "normal" | "insert" }
  | { type: "all"; goals: RawObjective[] };

const objectiveSchema: z.ZodType<RawObjective> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("buffer_equals"), target: z.string() }),
    z.strictObject({
      type: z.literal("cursor_at"),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
    }),
    z.strictObject({ type: z.literal("mode_equals"), mode: vimModeSchema }),
    z.strictObject({ type: z.literal("all"), goals: z.array(objectiveSchema).min(2) }),
  ]),
);

/** Normalized objective: cursors are 0-based engine positions, buffers are split into lines. */
export type Objective =
  | { readonly type: "buffer_equals"; readonly targetLines: readonly string[] }
  | { readonly type: "cursor_at"; readonly position: Position }
  | { readonly type: "mode_equals"; readonly mode: VimMode }
  | { readonly type: "all"; readonly goals: readonly Objective[] };

function normalizeObjective(raw: RawObjective): Objective {
  switch (raw.type) {
    case "buffer_equals":
      return { type: "buffer_equals", targetLines: splitLines(raw.target) };
    case "cursor_at":
      // Same normalization boundary as the initial cursor: content is 1-based.
      return { type: "cursor_at", position: { line: raw.line - 1, column: raw.column - 1 } };
    case "mode_equals":
      return { type: "mode_equals", mode: raw.mode };
    case "all":
      return { type: "all", goals: raw.goals.map(normalizeObjective) };
  }
}

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

/** Hints reveal progressively: levels count 1, 2, 3... and never become available earlier than the previous one. */
const hintsSchema = z.array(hintSchema).superRefine((hints, ctx) => {
  hints.forEach((hint, index) => {
    if (hint.level !== index + 1) {
      ctx.addIssue({
        code: "custom",
        path: [index, "level"],
        message: `hint levels must be 1, 2, 3... in order (expected ${index + 1})`,
      });
    }
    const previous = hints[index - 1];
    if (previous && hint.afterMs < previous.afterMs) {
      ctx.addIssue({
        code: "custom",
        path: [index, "afterMs"],
        message: "a hint cannot become available before the previous one",
      });
    }
  });
});

const environmentSchema = z.strictObject({
  type: z.literal("simulator"),
  profile: z.string().min(1),
});

const metadataSchema = z.strictObject({
  /** Language of the buffer, e.g. `javascript`. */
  language: z.string().min(1).optional(),
  /** Where the situation happens, e.g. `config-file`; transfer exercises vary it. */
  context: z.string().min(1).optional(),
  estimatedSeconds: z.number().int().positive().optional(),
  /** Tags that make this exercise count as transfer evidence for its skills (M4). */
  transferTags: z.array(tagSchema).default([]),
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
    difficulty: difficultySchema,
    environment: environmentSchema.default({ type: "simulator", profile: "vim-basic-v1" }),
    initialState: initialStateSchema,
    objective: objectiveSchema,
    evaluation: evaluationSchema,
    solutions: z
      .array(solutionSchema)
      .min(1)
      .refine((solutions) => solutions.some((solution) => solution.classification === "optimal"), {
        message: "declare at least one solution classified optimal (it is the efficiency baseline)",
      }),
    antiPatterns: z.array(z.enum(ANTI_PATTERN_IDS)).default([]),
    hints: hintsSchema.default([]),
    metadata: metadataSchema.default({ transferTags: [] }),
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
      /** Canonical key tokens applied before the attempt starts. */
      setupKeys: exercise.initialState.setupKeys
        ? tokenizeKeySequence(exercise.initialState.setupKeys)
        : [],
    },
    objective: normalizeObjective(exercise.objective),
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
export type ExerciseObjective = Objective;
export type ExerciseHint = Exercise["hints"][number];
export type AntiPatternId = (typeof ANTI_PATTERN_IDS)[number];
