import { z } from "zod";

import { KEYMAP_ACTIONS, KEYMAP_TARGETS, KEYMAP_TARGETED_ACTIONS } from "./keymap-vocabulary";
import { SOLUTION_CLASSIFICATIONS } from "./primitives";

/**
 * The actions that name the file they act on: opening a file, or starting one the disk lacks (T4b).
 * Every other action acts on what is already focused, so a path there would be a second truth.
 */
const PATHED_ACTIONS = ["file.open", "file.new"] as const;

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
 * One action of a workspace solution: the shared fields plus the file a file action opens (T4b).
 *
 * A workspace story is about files and buffers, so `file.open` and `file.new` must say which file;
 * keeping the field on a schema of its own is what makes `path` an error everywhere else, instead of
 * a field the vim and shell kinds silently accept without ever using it.
 */
export const workspaceActionRefSchema = z
  .strictObject({ ...actionFields, path: projectPathSchema.optional() })
  .superRefine((solution, ctx) => {
    checkTarget(solution, ctx);
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
