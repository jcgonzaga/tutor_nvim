import type { KeymapAction, WorkspaceSolutionAction } from "@tutor-nvim/exercise-schema";
import type { WorkspaceActionOptions } from "@tutor-nvim/workspace-engine";

/*
 * The two directions between a recorded action and the engine's options (T8).
 *
 * A content solution and a learner's attempt speak the same language: an action name plus the one
 * thing it acts on (a path, the text it types, the query it searches for, the command it runs, the
 * tab it moves into). The engine takes those in a `WorkspaceActionOptions` bag, so the two sides are
 * one conversion each, and neither re-implements "which field belongs to which action" — the schema
 * already rejects a field on an action that does not take it.
 */

/** What one recorded action hands the engine: the fields it carries, and nothing invented. */
export function engineOptions(action: WorkspaceSolutionAction): WorkspaceActionOptions {
  return {
    ...(action.path === undefined ? {} : { path: action.path }),
    ...(action.text === undefined ? {} : { text: action.text }),
    ...(action.query === undefined ? {} : { query: action.query }),
    ...(action.command === undefined ? {} : { command: action.command }),
    // A move says which tab it moves the window into, the way a file action says which file (T7a2).
    ...(action.tab === undefined ? {} : { tabId: action.tab }),
  };
}

/**
 * The action as the attempt records it: the name a layer resolved, plus whatever the caller knew
 * about it (a learner's key names no path, so the view supplies one when it has it).
 *
 * The result is a `WorkspaceSolutionAction`, the same shape content declares, so a replay of the
 * attempt's `actions` can be handed to `simulateWorkspaceSolution` unchanged and reaches the same
 * workspace (T8).
 */
export function recordedAction(
  action: WorkspaceSolutionAction | KeymapAction,
  options: WorkspaceActionOptions = {},
): WorkspaceSolutionAction {
  const base: WorkspaceSolutionAction = typeof action === "string" ? { action } : action;
  return {
    ...base,
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(options.text === undefined ? {} : { text: options.text }),
    ...(options.query === undefined ? {} : { query: options.query }),
    ...(options.command === undefined ? {} : { command: options.command }),
    ...(options.tabId === undefined ? {} : { tab: options.tabId }),
  };
}
