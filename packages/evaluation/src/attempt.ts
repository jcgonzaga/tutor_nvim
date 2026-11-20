import {
  createVimState,
  dispatch,
  formatKey,
  keyInputFromToken,
  runKeys,
  type KeyInput,
  type Position,
  type VimMode,
  type VimState,
} from "@tutor-nvim/vim-engine";
import { dispatchShellKey, initShell, type ShellState } from "@tutor-nvim/shell-engine";
import {
  applyWorkspaceAction,
  createWorkspace,
  dispatchWorkspace,
  type WorkspaceActionOptions,
  type WorkspaceState,
} from "@tutor-nvim/workspace-engine";
import type {
  Exercise,
  KeymapAction,
  ShellExercise,
  VimExercise,
  WorkspaceExercise,
  WorkspaceSolutionAction,
} from "@tutor-nvim/exercise-schema";
import { goalMet } from "./goal";
import type { HintReveal } from "./hints";
import { engineOptions, recordedAction } from "./workspace-action";

/** Input stamped by the adapter (`performance.now()`), in milliseconds. */
export interface TimedKeyInput extends KeyInput {
  readonly timestamp: number;
}

/**
 * One logical input, enough to replay the attempt by feeding `key`/modifiers to
 * the engine again. Kept local during the attempt; never sent per keypress.
 */
export interface InputEvent {
  readonly sequence: number;
  readonly timestamp: number;
  readonly key: string;
  /** Physical key (`KeyboardEvent.code`); `null` for synthetic input such as solution runs. */
  readonly code: string | null;
  /** Canonical notation (`<Esc>`), the unit strategy matching compares. */
  readonly logicalKey: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
  /** Mode the engine was in when the input arrived (`shell` for the terminal). */
  readonly mode: VimMode | "shell";
  /** In the shell the caret sits on line 0 at the end of what has been typed. */
  readonly cursorBefore: Position;
  readonly cursorAfter: Position;
  readonly accepted: boolean;
}

interface AttemptBase {
  readonly startedAt: number;
  readonly events: readonly InputEvent[];
  /** Timestamp of the input that satisfied the goal; `null` while in progress. */
  readonly completedAt: number | null;
  /** Hints the learner asked for, in order. */
  readonly hints: readonly HintReveal[];
}

export interface VimAttempt extends AttemptBase {
  readonly kind: "vim";
  readonly initialState: VimState;
  readonly state: VimState;
}

export interface ShellAttempt extends AttemptBase {
  readonly kind: "shell";
  readonly initialState: ShellState;
  readonly state: ShellState;
}

/**
 * One step of a workspace attempt, in the order it was taken (T9).
 *
 * A story is not a keypress stream: it is a sequence of *steps*, and every step reaches the engine in
 * one of two shapes. An **action** is a key the learner's layers resolved (`window.split-side-by-side`,
 * `file.open src/util.ts`). A **key** is everything the learner typed that no layer claimed — text in a
 * buffer, a `:e src/util.ts` at the command line, a command at a terminal prompt — which
 * `dispatchWorkspace` takes directly.
 *
 * Recording both is what makes the record faithful: most stories are solved by typing, so an attempt
 * that stored only actions would upload a solve with none of its steps and no server could replay it.
 */
export type WorkspaceStep =
  | { readonly kind: "action"; readonly action: WorkspaceSolutionAction }
  | { readonly kind: "key"; readonly key: TimedKeyInput };

export interface WorkspaceAttempt extends AttemptBase {
  readonly kind: "workspace";
  readonly initialState: WorkspaceState;
  readonly state: WorkspaceState;
  /**
   * Every step taken, in order: what the attempt did, and what a submission uploads. A step is an
   * action a layer resolved or a key the engine took, so a story solved by typing has a full record
   * even though it spent no actions at all (T9).
   */
  readonly steps: readonly WorkspaceStep[];
  /**
   * The actions among the steps, in order. A workspace attempt is graded by what it cost (S5): the
   * same end state reached in more steps is a worse strategy, so the steps are what the
   * classification divides by, and this list is the declared-solution comparison.
   */
  readonly actions: readonly WorkspaceSolutionAction[];
}

/** An attempt in any simulator; `kind` tells which, and always matches its exercise's. */
export type Attempt = VimAttempt | ShellAttempt | WorkspaceAttempt;

export function startAttempt(exercise: VimExercise, startedAt: number): VimAttempt;
export function startAttempt(exercise: ShellExercise, startedAt: number): ShellAttempt;
export function startAttempt(exercise: WorkspaceExercise, startedAt: number): WorkspaceAttempt;
export function startAttempt(exercise: Exercise, startedAt: number): Attempt;
export function startAttempt(exercise: Exercise, startedAt: number): Attempt {
  if (exercise.kind === "workspace") {
    const initialState = createWorkspace({
      files: exercise.initialState.files,
      path: exercise.initialState.path,
      cwd: exercise.initialState.cwd,
      // Carried from the declaration, so a learner's attempt can open the terminal the exercise
      // describes and the replay of the same story starts from the same workspace (T7a1).
      terminal: exercise.initialState.terminal,
    });
    return {
      kind: "workspace",
      startedAt,
      initialState,
      state: initialState,
      events: [],
      steps: [],
      actions: [],
      completedAt: null,
      hints: [],
    };
  }
  if (exercise.kind === "shell") {
    const { files, modes, cwd } = exercise.initialState;
    const initialState = initShell({
      files: Object.fromEntries(
        Object.entries(files).map(([path, content]) => {
          const mode = modes[path];
          return [path, mode === undefined ? content : { content, mode }];
        }),
      ),
      cwd: cwd === "" ? "." : cwd,
    });
    return {
      kind: "shell",
      startedAt,
      initialState,
      state: initialState,
      events: [],
      completedAt: null,
      hints: [],
    };
  }
  const initialState = runKeys(
    createVimState({
      lines: exercise.initialState.lines,
      cursor: exercise.initialState.cursor,
      mode: exercise.initialState.vimMode,
    }),
    exercise.initialState.setupKeys.map(keyInputFromToken),
  );
  return {
    kind: "vim",
    startedAt,
    initialState,
    state: initialState,
    events: [],
    completedAt: null,
    hints: [],
  };
}

/**
 * Telemetry only: runs the engine and appends the event. Knows nothing about goals.
 *
 * A workspace attempt has no key path here on purpose: its keys go through `recordWorkspaceKey`,
 * which dispatches the workspace engine (typing in a buffer, a `:` command, a terminal prompt) and
 * records the key as a step of that attempt. Calling this one would dispatch the wrong engine, so it
 * says which function to use instead.
 */
export function recordInput<A extends Attempt>(attempt: A, input: TimedKeyInput): A {
  if (attempt.kind === "workspace") {
    throw new Error(
      "a workspace attempt takes its keys through recordWorkspaceKey: recordInput dispatches the vim and shell engines, which the workspace replaces",
    );
  }
  if (attempt.kind === "shell") {
    const { state, accepted } = dispatchShellKey(attempt.state, input);
    const event: InputEvent = {
      ...baseEvent(attempt, input, accepted),
      mode: "shell",
      cursorBefore: { line: 0, column: attempt.state.line.length },
      cursorAfter: { line: 0, column: state.line.length },
    };
    return { ...attempt, state, events: [...attempt.events, event] } as A;
  }
  const { state, accepted } = dispatch(attempt.state, input);
  const event: InputEvent = {
    ...baseEvent(attempt, input, accepted),
    mode: attempt.state.mode,
    cursorBefore: attempt.state.cursor,
    cursorAfter: state.cursor,
  };
  return { ...attempt, state, events: [...attempt.events, event] } as A;
}

/**
 * One recorded workspace action, and what it did.
 *
 * `applied: false` means the engine refused it: `attempt` is then the very attempt that was given,
 * unchanged, with the engine's reason, so a caller can show why the key did nothing instead of
 * reporting a state it never reached.
 */
export interface WorkspaceActionRecording {
  readonly attempt: WorkspaceAttempt;
  readonly applied: boolean;
  /** Why the action could not apply. Absent when it did. */
  readonly reason?: string;
}

/** Why a workspace attempt takes no further actions: it ended, solved or given up. */
const WORKSPACE_ATTEMPT_ENDED = "the attempt has already ended";

/**
 * Records one action on a workspace attempt, the way `recordInput` records one key (T8).
 *
 * The action is applied through `applyWorkspaceAction`, the same code the content gate and the
 * replay use, so an attempt cannot reach a workspace the engine could not, and a refused action
 * changes nothing. It is appended as a step, and in the shape content declares
 * (`WorkspaceSolutionAction`, options included), because those are what a replay and a ghost run
 * have to work from: replaying the steps reaches the same state (S5, T9).
 *
 * Telemetry only: it knows nothing about the goal, exactly like `recordInput`.
 */
export function recordWorkspaceAction(
  attempt: WorkspaceAttempt,
  action: WorkspaceSolutionAction | KeymapAction,
  options: WorkspaceActionOptions = {},
): WorkspaceActionRecording {
  const recorded = recordedAction(action, options);
  const result = applyWorkspaceAction(attempt.state, recorded.action, engineOptions(recorded));
  if (!result.applied) {
    return {
      attempt,
      applied: false,
      reason: result.reason ?? `${recorded.action} could not be applied`,
    };
  }
  return {
    attempt: {
      ...attempt,
      state: result.state,
      steps: [...attempt.steps, { kind: "action", action: recorded }],
      actions: [...attempt.actions, recorded],
    },
    applied: true,
  };
}

/**
 * Records a workspace action and marks the attempt complete the first time the objective is met.
 *
 * The workspace counterpart of `advanceAttempt`: a finished attempt is frozen, so the actions after
 * the one that solved the story are not counted against the learner, and `completedAt` is what makes
 * `evaluateAttempt` judge it. `at` is the adapter's clock (`performance.now()`), never read here.
 */
export function advanceWorkspaceAttempt(
  exercise: Exercise,
  attempt: WorkspaceAttempt,
  action: WorkspaceSolutionAction | KeymapAction,
  options: WorkspaceActionOptions = {},
  at = 0,
): WorkspaceActionRecording {
  if (attempt.completedAt !== null) {
    return { attempt, applied: false, reason: WORKSPACE_ATTEMPT_ENDED };
  }
  const recorded = recordWorkspaceAction(attempt, action, options);
  if (!recorded.applied) return recorded;
  return goalMet(exercise, recorded.attempt)
    ? { ...recorded, attempt: { ...recorded.attempt, completedAt: at } }
    : recorded;
}

/**
 * One key of a workspace attempt, and what the engine did with it.
 *
 * A workspace is driven by keys the learner's layers did not turn into an action: typing in a buffer
 * (T1) or at a terminal prompt (T7a3). `dispatchWorkspace` is that path, and this is its goal-aware
 * sibling, so the rule "the attempt ends the first time the objective is met" is written once for
 * the kind instead of once per screen.
 */
export interface WorkspaceKeyRecording {
  readonly attempt: WorkspaceAttempt;
  readonly accepted: boolean;
  /** Why the workspace refused the key; absent when it was consumed. */
  readonly reason?: string;
}

/**
 * Records a key the layers left unclaimed, without judging the goal: the body `advanceWorkspaceKey`
 * builds on, and what a replay uses to re-run the keys of an attempt.
 *
 * The state is whatever `dispatchWorkspace` made of it, so a key that reached a buffer, a `:` command
 * or a terminal prompt is never re-implemented here. An accepted key is appended as a step, in order
 * with the actions, because a story solved by typing is made of nothing else. A refused key leaves
 * the attempt exactly as it was, with the engine's reason: nothing moved, so nothing was recorded.
 */
export function recordWorkspaceKey(
  attempt: WorkspaceAttempt,
  input: TimedKeyInput,
): WorkspaceKeyRecording {
  const result = dispatchWorkspace(attempt.state, input);
  if (!result.accepted) {
    return {
      attempt,
      accepted: false,
      ...(result.reason === undefined ? {} : { reason: result.reason }),
    };
  }
  return {
    attempt: {
      ...attempt,
      state: result.state,
      steps: [...attempt.steps, { kind: "key", key: input }],
    },
    accepted: true,
  };
}

/**
 * Records a key the layers left unclaimed, and marks the attempt complete when it reaches the goal.
 *
 * The workspace counterpart of `advanceAttempt`: a finished attempt is frozen, so the keys after the
 * one that solved the story are not counted against the learner, and `completedAt` is what makes
 * `evaluateAttempt` judge it.
 */
export function advanceWorkspaceKey(
  exercise: Exercise,
  attempt: WorkspaceAttempt,
  input: TimedKeyInput,
): WorkspaceKeyRecording {
  if (attempt.completedAt !== null) {
    return { attempt, accepted: false, reason: WORKSPACE_ATTEMPT_ENDED };
  }
  const recorded = recordWorkspaceKey(attempt, input);
  return goalMet(exercise, recorded.attempt)
    ? { ...recorded, attempt: { ...recorded.attempt, completedAt: input.timestamp } }
    : recorded;
}

function baseEvent(
  attempt: Attempt,
  input: TimedKeyInput,
  accepted: boolean,
): Omit<InputEvent, "mode" | "cursorBefore" | "cursorAfter"> {
  return {
    sequence: attempt.events.length,
    timestamp: input.timestamp,
    key: input.key,
    code: input.code ?? null,
    logicalKey: formatKey(input),
    ctrl: input.ctrl === true,
    alt: input.alt === true,
    shift: input.shift === true,
    meta: input.meta === true,
    accepted,
  };
}

/**
 * Records an input and marks the attempt complete the first time the goal is
 * met. Completed attempts are frozen: later input is ignored.
 */
export function advanceAttempt<A extends Attempt>(
  exercise: Exercise,
  attempt: A,
  input: TimedKeyInput,
): A {
  if (attempt.completedAt !== null) return attempt;
  const next = recordInput(attempt, input);
  return goalMet(exercise, next) ? { ...next, completedAt: input.timestamp } : next;
}

/**
 * Ends an attempt the learner did not solve (they chose to move on). The attempt is frozen like a
 * solved one, and evaluating it reports `success: false`, so giving up is an honest failed attempt
 * rather than a missing one. Calling it on an attempt that already ended changes nothing.
 */
export function giveUpAttempt<A extends Attempt>(attempt: A, at: number): A {
  return attempt.completedAt === null ? { ...attempt, completedAt: at } : attempt;
}
