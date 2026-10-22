import { formatKey } from "@tutor-nvim/vim-engine";
import { z } from "zod";
import { difficultySchema, explanationSchema, idSchema, slugSchema } from "./primitives";
import {
  EXERCISE_MODES,
  EXERCISE_SCHEMA_VERSION,
  SOLUTION_CLASSIFICATIONS,
  hintsSchema,
  metadataSchema,
} from "./schema";

/** Anti-patterns the shell evaluator can detect (an exercise declares the ones it cares about). */
export const SHELL_ANTI_PATTERN_IDS = [
  "repeated_failed_command",
  "cd_up_chain",
  "rm_rf_wildcard",
] as const;
export type ShellAntiPatternId = (typeof SHELL_ANTI_PATTERN_IDS)[number];

/**
 * A path inside the learner's home directory, as authors write it: relative, no `..`, no leading
 * slash. A trailing `/` (in `files`) declares an empty directory.
 */
const homePathSchema = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith("/"), "paths are relative to the home directory")
  .refine((path) => !path.split("/").includes(".."), 'paths cannot contain ".."');

/** Why a path is not a valid home-relative path, or `null`. Checked on record keys, where zod hides messages. */
const pathProblem = (path: string): string | null =>
  path === ""
    ? "a path cannot be empty"
    : path.startsWith("/")
      ? "paths are relative to the home directory"
      : path.split("/").includes("..")
        ? 'paths cannot contain ".."'
        : null;

function checkKeys(
  record: Readonly<Record<string, unknown>> | undefined,
  at: readonly (string | number)[],
  ctx: z.RefinementCtx,
): void {
  for (const path of Object.keys(record ?? {})) {
    const problem = pathProblem(path);
    if (problem) ctx.addIssue({ code: "custom", path: [...at, path], message: problem });
  }
}

const octalSchema = z.string().regex(/^[0-7]{3,4}$/, "a permission such as 644 or 755");

const initialStateSchema = z
  .strictObject({
    /** `{ "project/src/app.js": "content" }`; a path ending in `/` is an empty directory. */
    files: z.record(z.string(), z.string()).default({}),
    /** Permissions that differ from the default (644 for files), as octal strings. */
    modes: z.record(z.string(), octalSchema).default({}),
    /** Where the terminal starts, relative to home ("" is home itself). */
    cwd: z
      .string()
      .default("")
      .pipe(z.union([z.literal(""), homePathSchema])),
  })
  .superRefine((state, ctx) => {
    checkKeys(state.files, ["files"], ctx);
    checkKeys(state.modes, ["modes"], ctx);
    const paths = Object.keys(state.files).map((path) => path.replace(/\/$/, ""));
    for (const path of paths) {
      const parent = paths.find((other) => other !== path && path.startsWith(`${other}/`));
      const declaredAsFile = parent !== undefined && !(`${parent}/` in state.files);
      if (declaredAsFile) {
        ctx.addIssue({
          code: "custom",
          path: ["files", path],
          message: `"${parent}" is a file, so it cannot also contain "${path}"`,
        });
      }
    }
    // Permissions are set on files; a directory keeps the default.
    for (const path of Object.keys(state.modes)) {
      if (!(path in state.files) || path.endsWith("/")) {
        ctx.addIssue({
          code: "custom",
          path: ["modes", path],
          message: "sets the mode of a file that is not listed in `files`",
        });
      }
    }
  });

export type RawShellObjective =
  | {
      type: "fs_matches";
      files?: Record<string, string> | undefined;
      dirs?: string[] | undefined;
      absent?: string[] | undefined;
      modes?: Record<string, string> | undefined;
    }
  | { type: "cwd_equals"; path: string }
  | { type: "last_output_equals"; text: string }
  | { type: "last_output_contains"; text: string }
  | { type: "all"; goals: RawShellObjective[] };

const shellObjectiveSchema: z.ZodType<RawShellObjective> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .strictObject({
        type: z.literal("fs_matches"),
        /** Files that must exist with exactly this content. */
        files: z.record(z.string(), z.string()).optional(),
        /** Directories that must exist. */
        dirs: z.array(homePathSchema).optional(),
        /** Paths that must no longer exist. */
        absent: z.array(homePathSchema).optional(),
        /** Permissions that must hold, as octal strings. */
        modes: z.record(z.string(), octalSchema).optional(),
      })
      .superRefine((goal, ctx) => {
        checkKeys(goal.files, ["files"], ctx);
        checkKeys(goal.modes, ["modes"], ctx);
        if (!goal.files && !goal.dirs && !goal.absent && !goal.modes) {
          ctx.addIssue({
            code: "custom",
            message: "fs_matches needs at least one of files, dirs, absent or modes",
          });
        }
      }),
    z.strictObject({
      type: z.literal("cwd_equals"),
      path: z.union([z.literal(""), homePathSchema]),
    }),
    z.strictObject({ type: z.literal("last_output_equals"), text: z.string() }),
    z.strictObject({ type: z.literal("last_output_contains"), text: z.string().min(1) }),
    z.strictObject({ type: z.literal("all"), goals: z.array(shellObjectiveSchema).min(2) }),
  ]),
);

/** Normalized objective: permissions are numbers. */
export type ShellObjective =
  | {
      readonly type: "fs_matches";
      readonly files: Readonly<Record<string, string>>;
      readonly dirs: readonly string[];
      readonly absent: readonly string[];
      readonly modes: Readonly<Record<string, number>>;
    }
  | { readonly type: "cwd_equals"; readonly path: string }
  | { readonly type: "last_output_equals"; readonly text: string }
  | { readonly type: "last_output_contains"; readonly text: string }
  | { readonly type: "all"; readonly goals: readonly ShellObjective[] };

function normalizeObjective(raw: RawShellObjective): ShellObjective {
  switch (raw.type) {
    case "fs_matches":
      return {
        type: "fs_matches",
        files: raw.files ?? {},
        dirs: raw.dirs ?? [],
        absent: raw.absent ?? [],
        modes: Object.fromEntries(
          Object.entries(raw.modes ?? {}).map(([path, mode]) => [path, Number.parseInt(mode, 8)]),
        ),
      };
    case "all":
      return { type: "all", goals: raw.goals.map(normalizeObjective) };
    default:
      return raw;
  }
}

/** The key tokens that type one command and run it. */
export const keysForCommand = (command: string): string[] => [
  ...[...command].map((char) => formatKey({ key: char })),
  formatKey({ key: "Enter" }),
];

const solutionSchema = z.strictObject({
  /** One command line per entry, exactly as the learner would type it. */
  commands: z.array(z.string().min(1)).min(1),
  classification: z.enum(SOLUTION_CLASSIFICATIONS),
});

export const shellExerciseSchema = z
  .strictObject({
    schemaVersion: z.literal(EXERCISE_SCHEMA_VERSION),
    kind: z.literal("shell"),
    id: idSchema,
    slug: slugSchema,
    title: z.string().min(1),
    instruction: z.string().min(1).optional(),
    skillIds: z.array(slugSchema).min(1),
    mode: z.enum(EXERCISE_MODES),
    difficulty: difficultySchema,
    environment: z
      .strictObject({ type: z.literal("simulator"), profile: z.string().min(1) })
      .default({ type: "simulator", profile: "shell-basic-v1" }),
    initialState: initialStateSchema,
    objective: shellObjectiveSchema,
    solutions: z
      .array(solutionSchema)
      .min(1)
      .refine((solutions) => solutions.some((solution) => solution.classification === "optimal"), {
        message: "declare at least one solution classified optimal (it is the efficiency baseline)",
      }),
    antiPatterns: z.array(z.enum(SHELL_ANTI_PATTERN_IDS)).default([]),
    hints: hintsSchema.default([]),
    /** Why the best solution works; shown after a poor or failed attempt. */
    explanation: explanationSchema.optional(),
    metadata: metadataSchema.default({ transferTags: [] }),
  })
  .transform((exercise) => ({
    ...exercise,
    instruction: exercise.instruction ?? exercise.title,
    initialState: {
      files: exercise.initialState.files,
      modes: Object.fromEntries(
        Object.entries(exercise.initialState.modes).map(([path, mode]) => [
          path,
          Number.parseInt(mode, 8),
        ]),
      ),
      cwd: exercise.initialState.cwd,
    },
    objective: normalizeObjective(exercise.objective),
    solutions: exercise.solutions.map((solution) => ({
      classification: solution.classification,
      commands: solution.commands,
      /** What the learner sees as "your keys": the commands, one per Enter. */
      sequence: solution.commands.join("<CR>") + "<CR>",
      /** Canonical key tokens, ready to compare with recorded input. */
      keys: solution.commands.flatMap(keysForCommand),
    })),
  }));

export type ShellExerciseInput = z.input<typeof shellExerciseSchema>;
export type ShellExercise = z.output<typeof shellExerciseSchema>;
export type ShellSolution = ShellExercise["solutions"][number];
