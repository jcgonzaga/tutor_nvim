import { z } from "zod";

import {
  KEYMAP_ACTIONS,
  KEYMAP_COMMAND_ACTIONS,
  KEYMAP_QUERY_ACTIONS,
  KEYMAP_TAB_ACTIONS,
  KEYMAP_TARGETS,
  KEYMAP_TARGETED_ACTIONS,
  KEYMAP_TEXT_ACTIONS,
} from "./keymap-vocabulary";
import { SOLUTION_CLASSIFICATIONS } from "./primitives";

/**
 * The actions that name the file they act on: opening a file, starting one the disk lacks (T4b), or
 * picking an open buffer out of the list (T5c). Every other action acts on what is already focused,
 * so a path there would be a second truth.
 */
const PATHED_ACTIONS = ["file.open", "file.new", "buffer.list"] as const;

/**
 * A path inside the simulated project. Relative and non-empty because the workspace matches paths
 * verbatim (`packages/workspace-engine` resolves no `cwd`, normalises nothing, T1), so `/src/a.ts`
 * would name a file no exercise can place on its disk.
 */
const projectPathSchema = z
  .string()
  .min(1, "must name a file inside the simulated project, so it cannot be empty")
  .refine((path) => !path.startsWith("/"), {
    message:
      'must name a file inside the simulated project: it is relative, so it cannot start with "/"',
  });

/**
 * The text a solution types: non-empty, because an insert that types nothing is not a step a learner
 * can take, and the engine refuses it.
 */
const typedTextSchema = z.string().min(1, "must be the text to type, so it cannot be empty");

/**
 * The query a picker-shaped action searches for: non-empty, because a finder that narrows by nothing
 * is not a step a learner can take, and the engine refuses it (T5c).
 */
const querySchema = z.string().min(1, "must be the query to search for, so it cannot be empty");

/**
 * The command a `shell.run` runs: non-empty, because running nothing is not a step a learner can
 * take, and the engine looks its output up in the exercise's declared table (T7a1).
 */
const commandSchema = z.string().min(1, "must be the command to run, so it cannot be empty");

/**
 * The tab a `workspace.move` moves the window into: non-empty, because a move that names nothing
 * moves nothing, and the engine matches tabs by the id it gives them (`tab:2`, T7a2).
 */
const tabSchema = z
  .string()
  .min(1, "must be the tab to move the window into, so it cannot be empty");

/** The name of an action and, for an operator, what it acts on: the fields every solution shares. */
const actionFields = {
  action: z.enum(KEYMAP_ACTIONS),
  /** What an operator acts on; only the editing verbs take one (see `KEYMAP_TARGETED_ACTIONS`). */
  target: z.enum(KEYMAP_TARGETS).optional(),
} as const;

/** A `target` is read only where the vocabulary takes one; anywhere else it is an error. */
function checkTarget(ref: { action: string; target?: string }, ctx: z.RefinementCtx): void {
  if ((KEYMAP_TARGETED_ACTIONS as readonly string[]).includes(ref.action)) return;
  if (ref.target === undefined) return;
  ctx.addIssue({
    code: "custom",
    path: ["target"],
    message: `"${ref.action}" takes no target: only ${KEYMAP_TARGETED_ACTIONS.join(", ")} do`,
  });
}

/**
 * A `query` is read only where the vocabulary searches the project with one, and it is required
 * there: the action exists to say what is searched for, so a solution that gives no query is as
 * wrong as one that gives it to a verb that searches nothing (T5c).
 */
function checkQuery(ref: { action: string; query?: string }, ctx: z.RefinementCtx): void {
  if ((KEYMAP_QUERY_ACTIONS as readonly string[]).includes(ref.action)) {
    if (ref.query === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["query"],
        message: `"${ref.action}" needs a query: it names the text the picker searches for`,
      });
    }
    return;
  }
  if (ref.query === undefined) return;
  ctx.addIssue({
    code: "custom",
    path: ["query"],
    message: `"${ref.action}" takes no query: only ${KEYMAP_QUERY_ACTIONS.join(", ")} search the project`,
  });
}

/**
 * A `text` is read only where the vocabulary types one, and it is required there: the action exists
 * to say what is written, so a solution that gives no text is as wrong as one that gives it to a
 * verb that types nothing.
 */
function checkText(ref: { action: string; text?: string }, ctx: z.RefinementCtx): void {
  if ((KEYMAP_TEXT_ACTIONS as readonly string[]).includes(ref.action)) {
    if (ref.text === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: `"${ref.action}" needs a text: it types the text the solution names`,
      });
    }
    return;
  }
  if (ref.text === undefined) return;
  ctx.addIssue({
    code: "custom",
    path: ["text"],
    message: `"${ref.action}" takes no text: only ${KEYMAP_TEXT_ACTIONS.join(", ")} types text`,
  });
}

/**
 * A `command` is read only where the vocabulary runs one, and it is required there: the action exists
 * to say what runs, so a solution that gives no command is as wrong as one that gives it to a verb
 * that runs nothing (T7a1).
 */
function checkCommand(ref: { action: string; command?: string }, ctx: z.RefinementCtx): void {
  if ((KEYMAP_COMMAND_ACTIONS as readonly string[]).includes(ref.action)) {
    if (ref.command === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["command"],
        message: `"${ref.action}" needs a command: it names the command to run`,
      });
    }
    return;
  }
  if (ref.command === undefined) return;
  ctx.addIssue({
    code: "custom",
    path: ["command"],
    message: `"${ref.action}" takes no command: only ${KEYMAP_COMMAND_ACTIONS.join(", ")} runs a command`,
  });
}

/**
 * A `tab` is read only where the vocabulary moves a window between tabs, and it is required there:
 * the action exists to say where the window goes, so a move that names no tab is as wrong as a tab
 * given to a verb that moves nothing (T7a2).
 */
function checkTab(ref: { action: string; tab?: string }, ctx: z.RefinementCtx): void {
  if ((KEYMAP_TAB_ACTIONS as readonly string[]).includes(ref.action)) {
    if (ref.tab === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["tab"],
        message: `"${ref.action}" needs a tab: it names the workspace the window moves into`,
      });
    }
    return;
  }
  if (ref.tab === undefined) return;
  ctx.addIssue({
    code: "custom",
    path: ["tab"],
    message: `"${ref.action}" takes no tab: only ${KEYMAP_TAB_ACTIONS.join(", ")} names a tab`,
  });
}

/**
 * A solution written as what the learner must accomplish, not as one tool's keys (S6).
 *
 * tmux, Herdr, Omarchy's tmux and Neovim all split a pane, with different keys and a different
 * cost. Naming the action lets any enabled layer that provides it solve the exercise, and lets the
 * strategy classification compare what each layer's keys cost. The concrete keys are derived from
 * the enabled catalogs (`packages/keymap`), never written here: one copy per tool is what this field
 * exists to avoid.
 *
 * One action: its name, plus what the operator acts on when the verb takes a text object (`di"` and
 * `dap` stay one action instead of one action each).
 */
export const actionRefSchema = z
  .strictObject(actionFields)
  .superRefine((solution, ctx) => checkTarget(solution, ctx));

export type ActionRef = z.output<typeof actionRefSchema>;

/**
 * One action of a workspace solution: the shared fields plus the file a file action opens, the text
 * an insert types, the query a project picker searches for (T4b, L9, T5c), the command a terminal
 * runs (T7a1) and the tab a move moves the window into (T7a2).
 *
 * A workspace story is about files, buffers and windows, so `file.open` and `file.new` must say which
 * file, `edit.insert` must say what is typed, `file.find`/`grep.project` must say what is searched for,
 * `shell.run` must say what runs and `workspace.move` must say where the window goes; keeping the
 * fields on a schema of its own is what makes `path`, `text`, `query`, `command` and `tab` an error
 * everywhere else, instead of fields the vim and shell kinds silently accept without ever using them.
 */
export const workspaceActionRefSchema = z
  .strictObject({
    ...actionFields,
    path: projectPathSchema.optional(),
    text: typedTextSchema.optional(),
    query: querySchema.optional(),
    command: commandSchema.optional(),
    tab: tabSchema.optional(),
  })
  .superRefine((solution, ctx) => {
    checkTarget(solution, ctx);
    checkText(solution, ctx);
    checkQuery(solution, ctx);
    checkCommand(solution, ctx);
    checkTab(solution, ctx);
    if (solution.path === undefined) return;
    if ((PATHED_ACTIONS as readonly string[]).includes(solution.action)) return;
    ctx.addIssue({
      code: "custom",
      path: ["path"],
      message: `"${solution.action}" takes no path: only ${PATHED_ACTIONS.join(", ")} name a path inside the simulated project`,
    });
  });

export type WorkspaceActionRef = z.output<typeof workspaceActionRefSchema>;

/** An action with the classification the learner (or CI) reports for it. */
export const actionSolutionSchema = actionRefSchema.extend({
  classification: z.enum(SOLUTION_CLASSIFICATIONS),
});

export type ActionSolution = z.output<typeof actionSolutionSchema>;

/** The action solutions of one exercise, parsed; rejects the same action declared twice. */
export const actionSolutionsSchema = z
  .array(actionSolutionSchema)
  .max(50)
  .default([])
  .refine(
    (solutions) =>
      new Set(solutions.map((solution) => `${solution.action}\u0000${solution.target ?? ""}`))
        .size === solutions.length,
    "declares the same action twice: one line per action, whatever the layer",
  );
