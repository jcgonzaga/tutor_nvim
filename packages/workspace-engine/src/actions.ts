import {
  cycleBuffer,
  closeBuffer,
  findFile,
  grepProject,
  listBuffer,
  newFile,
  openFile,
  saveActiveFile,
  type FileStepResult,
} from "./files";
import { typeText } from "./editing";
import type {
  FocusStep,
  WindowLayout,
  WindowLeaf,
  WindowNode,
  WorkspaceActionOptions,
  WorkspaceActionResult,
  WorkspaceState,
  WorkspaceTab,
  WorkspaceTerminal,
} from "./types";
import {
  activeTab,
  focusedNode,
  isLeafNode,
  lastLeafPath,
  leafNode,
  nodeAt,
  replaceAt,
  splitNode,
  terminalNode,
  withActiveTab,
  withFocus,
  withTabs,
} from "./windows";
import { openBuffer } from "./workspace";

/*
 * The actions of the workspace (S1, S2, S4, T4b).
 *
 * They are actions, never keys: the layer catalogs map a tool's keys to one of these names and
 * `packages/keymap` resolves them, so tmux's `C-b %` and Herdr's `C-b v` reach the same split, and
 * Goto-file, `n` in a file picker and `:e` reach the same `file.open`. This engine never learns what
 * a prefix is.
 *
 * Files, buffers and typing are here for the same reason windows are (T4b, L9): opening
 * `src/other.ts` is one thing however the learner does it, and a story says what it writes, so
 * `file.*`, `buffer.*` and `edit.insert` call the same state functions the `:` command line calls
 * (`edit.insert` typing through `vim-engine`), and the parity tests assert they agree.
 *
 * The picker-shaped actions are here as deterministic queries (T5c): the project is fixed, so
 * `file.find` answers with the first file in path order whose path holds its query, `grep.project`
 * records the matching rows in the state, and `buffer.list` focuses the open buffer its path names.
 * Nothing is scored, ranked or timed, so a replay is the state the recording made.
 *
 * Every operation is total: one that cannot apply returns the state it was given, unchanged, with
 * `applied: false` and a reason. Nothing throws and nothing is a silent no-op.
 *
 * Two states decide before the action does (T7a2). A detached session is frozen, so only attaching
 * and detaching reach it; resize mode is an input mode, so only resizing, leaving it and detaching
 * apply while it is on. Both refusals come first, before any effect, and name the state or the mode
 * they are in, so a key that does nothing says why. `dispatchWorkspace` asks the same gate for a
 * terminal's prompt keys (T7a3), so a frozen or resizing workspace refuses what the learner types
 * with the words it refuses the action.
 */

/** The window, tab and workspace actions of the keymap vocabulary this engine can apply. */
export const WORKSPACE_ACTIONS = [
  "window.split-side-by-side",
  "window.split-stacked",
  "window.close",
  "window.focus-left",
  "window.focus-right",
  "window.focus-up",
  "window.focus-down",
  "window.resize-wider",
  "window.resize-narrower",
  "window.resize-taller",
  "window.resize-shorter",
  "window.enter-resize-mode",
  "window.leave-resize-mode",
  "window.zoom",
  "window.swap",
  "window.new",
  "tab.new",
  "tab.next",
  "tab.previous",
  "workspace.switch",
  "workspace.move",
] as const;
export type WorkspaceActionName = (typeof WORKSPACE_ACTIONS)[number];

/** The file and buffer actions of the keymap vocabulary this engine applies (T4b, stories 1-7). */
export const WORKSPACE_FILE_ACTIONS = [
  "file.open",
  "file.new",
  "file.save",
  "file.close-buffer",
  "buffer.next",
  "buffer.previous",
] as const;
export type WorkspaceFileActionName = (typeof WORKSPACE_FILE_ACTIONS)[number];

/**
 * The picker-shaped actions, each modelled as a deterministic query instead of an interactive
 * picker (T5c), because the simulated project is a fixed set of files (S6): `file.find` opens the
 * first file in path order whose path holds its query, `grep.project` records the matching lines in
 * the state, and `buffer.list` focuses the open buffer its path names. Nothing is scored, ranked or
 * timed, so the same query always answers the same file and the same rows.
 */
export const WORKSPACE_PICKER_ACTIONS = ["file.find", "grep.project", "buffer.list"] as const;
export type WorkspacePickerActionName = (typeof WORKSPACE_PICKER_ACTIONS)[number];

/**
 * The editing action this engine applies: the one that changes text, and the only one whose keys are
 * the content the solution names (L9). It types through `vim-engine`'s INSERT mode, never by writing
 * a buffer (AGENTS.md 2.3).
 */
export const WORKSPACE_EDIT_ACTIONS = ["edit.insert"] as const;
export type WorkspaceEditActionName = (typeof WORKSPACE_EDIT_ACTIONS)[number];

/**
 * The terminal actions this engine applies (T7a1, stories 15 and 19): `app.launch-terminal` opens a
 * window on a session and `shell.run` appends the output the exercise declared for a command.
 *
 * They are actions and not keys like every other one, so Omarchy's `Super-Enter`, tmux's pane split
 * and a shell's `Enter` reach them through the catalogs instead of this engine learning a prefix. A
 * simulated machine has no processes (S6), so what a command prints is content: the exercise declares
 * it and the engine never invents a line.
 */
export const WORKSPACE_TERMINAL_ACTIONS = ["app.launch-terminal", "shell.run"] as const;
export type WorkspaceTerminalActionName = (typeof WORKSPACE_TERMINAL_ACTIONS)[number];

/**
 * The session actions this engine applies (T7a2, story 20): `session.detach` freezes the workspace
 * and `session.attach` restores it, and they are the only two a frozen workspace accepts.
 *
 * They are actions and not keys like every other one, so tmux's `C-b d` and Herdr's `q` reach them
 * through the catalogs. What they change is one flag: detaching keeps every tab, tree, buffer,
 * terminal, zoom and search exactly where it was, because detaching is leaving the session running,
 * not closing it.
 */
export const WORKSPACE_SESSION_ACTIONS = ["session.detach", "session.attach"] as const;
export type WorkspaceSessionActionName = (typeof WORKSPACE_SESSION_ACTIONS)[number];

/**
 * The actions resize mode still accepts (T7a2, story 18): resizing, leaving the mode, and detaching.
 * Everything else is refused with the mode named, so a learner is told why their key did nothing
 * instead of watching a pane not move.
 */
const RESIZE_MODE_ACTIONS: readonly string[] = [
  "window.resize-wider",
  "window.resize-narrower",
  "window.resize-taller",
  "window.resize-shorter",
  "window.leave-resize-mode",
  // Entering again reaches its own refusal, which says the workspace is already in the mode instead
  // of telling the learner to leave the mode they are trying to enter.
  "window.enter-resize-mode",
  "session.detach",
];

/** A resize is a step of the ratio, never a number of pixels, so it stays deterministic. */
const RATIO_STEP = 0.05;
const RATIO_MIN = 0.1;
const RATIO_MAX = 0.9;
/** The share a fresh split gives its first child. */
const DEFAULT_RATIO = 0.5;

const applied = (state: WorkspaceState): WorkspaceActionResult => ({ state, applied: true });
const refused = (state: WorkspaceState, reason: string): WorkspaceActionResult => ({
  state,
  applied: false,
  reason,
});
/** A shared file or buffer step in the action's own terms: applied, or refused with its reason. */
const fromStep = (step: FileStepResult): WorkspaceActionResult =>
  step.reason === undefined ? applied(step.state) : refused(step.state, step.reason);

/** Quotes a command so a refusal shows exactly what was asked to run, as the pickers' do. */
const quoted = (value: string): string => JSON.stringify(value);

/** The same focus path: two steps lists that reach the same window. */
const sameFocus = (left: readonly FocusStep[], right: readonly FocusStep[]): boolean =>
  left.length === right.length && left.every((step, index) => step === right[index]);

/**
 * Why the state refuses an action before the action runs, or `null` when it does not (T7a2).
 *
 * A detached session is frozen, so only attaching and detaching reach it: nothing the learner presses
 * can change what they will find when they come back. Resize mode is an input mode, so while it is on
 * only resizing, leaving it and detaching apply. The detached check runs first because it is the
 * outer freeze, and because a workspace frozen while resizing must still be attachable: the mode it
 * was left in is what attaching finds, never a lock nobody can open.
 *
 * Exported because a terminal's prompt keys are refused by the same gate (T7a3): the words come from
 * here and only here, so a typed character and `shell.run` can never explain the freeze differently.
 */
export function stateRefusal(state: WorkspaceState, action: string): string | null {
  if (state.detached) {
    if ((WORKSPACE_SESSION_ACTIONS as readonly string[]).includes(action)) return null;
    return `${action}: the session is detached; attach to it first`;
  }
  if (state.mode === "resize") {
    if (RESIZE_MODE_ACTIONS.includes(action)) return null;
    return `${action}: the workspace is in resize mode; leave it first`;
  }
  return null;
}

/**
 * Whether the focused window shows a terminal. A session has no buffer behind it, so an action that
 * writes through the active buffer has nowhere to go while a terminal has the keys (T7a2, T7a1).
 */
function terminalFocused(state: WorkspaceState): boolean {
  const focused = focusedWindow(state);
  return focused !== undefined && focused.node.kind === "terminal";
}

/** The direction a focus action moves in, matched against a split's layout. */
interface Direction {
  readonly layout: WindowLayout;
  readonly towards: FocusStep;
}

/**
 * The tab and the window the keys go to, or `undefined` when there is no active tab or the focus
 * path does not reach a window. A terminal leaf is a window here like any other (T7a1).
 */
function focusedWindow(
  state: WorkspaceState,
): { readonly tab: WorkspaceTab; readonly node: WindowLeaf } | undefined {
  const tab = activeTab(state);
  const node = tab === undefined ? undefined : focusedNode(tab);
  if (tab === undefined || node === undefined || !isLeafNode(node)) return undefined;
  return { tab, node };
}

/**
 * The state with a side-by-side pane beside the focused window, focused, showing `node`.
 *
 * `window.new` and `app.launch-terminal` both open something beside the window the learner is in, so
 * they reach the tree through here: only what the new pane shows differs, and a terminal window is
 * therefore split, focused and cleaned up by the same code a file window is.
 */
function withPaneBeside(
  state: WorkspaceState,
  focused: { readonly tab: WorkspaceTab; readonly node: WindowLeaf },
  node: WindowNode,
): WorkspaceState {
  const { tab } = focused;
  const root = replaceAt(
    tab.root,
    tab.focus,
    splitNode("side-by-side", DEFAULT_RATIO, focused.node, node),
  );
  return withActiveTab(state, { ...tab, root, focus: [...tab.focus, "second"] });
}

export function applyWorkspaceAction(
  state: WorkspaceState,
  action: string,
  options: WorkspaceActionOptions = {},
): WorkspaceActionResult {
  const frozen = stateRefusal(state, action);
  if (frozen !== null) return refused(state, frozen);

  switch (action) {
    case "window.split-side-by-side":
      return splitFocused(state, "side-by-side");
    case "window.split-stacked":
      return splitFocused(state, "stacked");
    case "window.close":
      return closeFocused(state);
    case "window.focus-left":
      return focusByDirection(state, action, { layout: "side-by-side", towards: "first" });
    case "window.focus-right":
      return focusByDirection(state, action, { layout: "side-by-side", towards: "second" });
    case "window.focus-up":
      return focusByDirection(state, action, { layout: "stacked", towards: "first" });
    case "window.focus-down":
      return focusByDirection(state, action, { layout: "stacked", towards: "second" });
    case "window.resize-wider":
      return resizeFocused(state, action, "side-by-side", 1);
    case "window.resize-narrower":
      return resizeFocused(state, action, "side-by-side", -1);
    case "window.resize-taller":
      return resizeFocused(state, action, "stacked", 1);
    case "window.resize-shorter":
      return resizeFocused(state, action, "stacked", -1);
    case "window.enter-resize-mode":
      return enterResizeMode(state, action);
    case "window.leave-resize-mode":
      return leaveResizeMode(state, action);
    case "window.zoom":
      return toggleZoom(state);
    case "window.swap":
      return swapFocused(state);
    case "window.new":
      return newWindow(state, options);
    case "app.launch-terminal":
      return launchTerminal(state);
    case "shell.run":
      return runShellCommand(state, options);
    case "tab.new":
      return newTab(state);
    case "tab.next":
      return cycleTab(state, 1);
    case "tab.previous":
      return cycleTab(state, -1);
    case "workspace.switch":
      return switchTab(state, options);
    case "workspace.move":
      return moveWindow(state, options);
    case "session.detach":
      return detachSession(state);
    case "session.attach":
      return attachSession(state);
    case "file.open":
      return openFileAction(state, options);
    case "file.new":
      return newFileAction(state, options);
    case "file.save":
      return saveFileAction(state);
    case "file.close-buffer":
      return closeBufferAction(state);
    case "buffer.next":
      return cycleBufferAction(state, action, 1);
    case "buffer.previous":
      return cycleBufferAction(state, action, -1);
    case "edit.insert":
      return insertTextAction(state, options);
    case "file.find":
      return findFileAction(state, options);
    case "grep.project":
      return grepProjectAction(state, options);
    case "buffer.list":
      return listBufferAction(state, options);
    default:
      return refused(state, `Unknown workspace action: ${action}`);
  }
}

/** `file.open` takes its path from the options: the simulation types no path and opens no dialog. */
function openFileAction(
  state: WorkspaceState,
  options: WorkspaceActionOptions,
): WorkspaceActionResult {
  const path = options.path;
  if (path === undefined || path === "") return refused(state, "file.open: no path given");
  return fromStep(openFile(state, path));
}

/** `file.new` creates a file the disk does not have yet; saving it is what writes it. */
function newFileAction(
  state: WorkspaceState,
  options: WorkspaceActionOptions,
): WorkspaceActionResult {
  const path = options.path;
  if (path === undefined || path === "") return refused(state, "file.new: no path given");
  return fromStep(newFile(state, path));
}

/**
 * `file.save` is applied only when there is something to save; `:w` on an unchanged buffer is a
 * write that changes nothing and is accepted, so the two agree on the state and differ only in
 * whether the action had an effect. A focused terminal window shows a session, not a buffer, so there
 * is nothing there to write either (T7a2).
 */
function saveFileAction(state: WorkspaceState): WorkspaceActionResult {
  if (terminalFocused(state)) {
    return refused(
      state,
      "file.save: the focused window is a terminal, so there is no buffer to save",
    );
  }
  const active = state.buffers.find((buffer) => buffer.id === state.activeBufferId);
  if (active === undefined) return refused(state, "E32: No file name");
  if (!active.modified) return refused(state, "file.save: the active buffer has no changes");
  return fromStep(saveActiveFile(state));
}

/** `file.close-buffer` unloads the buffer in front of the learner, and a terminal shows none (T7a2). */
function closeBufferAction(state: WorkspaceState): WorkspaceActionResult {
  if (terminalFocused(state)) {
    return refused(
      state,
      "file.close-buffer: the focused window is a terminal, so there is no buffer to close",
    );
  }
  return fromStep(closeBuffer(state));
}

/** Cycling needs somewhere to go: with one buffer open there is no other buffer to apply it to. */
function cycleBufferAction(
  state: WorkspaceState,
  action: string,
  offset: 1 | -1,
): WorkspaceActionResult {
  if (state.buffers.length < 2) return refused(state, `${action}: only one buffer is open`);
  return fromStep(cycleBuffer(state, offset));
}

/**
 * `file.find` searches the project for the fragment the action names. A query the action does not
 * carry is a refusal, because the simulation types no query and opens no dialog (S6).
 */
function findFileAction(
  state: WorkspaceState,
  options: WorkspaceActionOptions,
): WorkspaceActionResult {
  const query = options.query;
  if (query === undefined) return refused(state, "file.find: no query given");
  return fromStep(findFile(state, query));
}

/** `grep.project` records the rows it finds; opening the file a row names is a separate action. */
function grepProjectAction(
  state: WorkspaceState,
  options: WorkspaceActionOptions,
): WorkspaceActionResult {
  const query = options.query;
  if (query === undefined) return refused(state, "grep.project: no query given");
  return fromStep(grepProject(state, query));
}

/** `buffer.list` focuses an open buffer by its path: the list is the session, not the project. */
function listBufferAction(
  state: WorkspaceState,
  options: WorkspaceActionOptions,
): WorkspaceActionResult {
  const path = options.path;
  if (path === undefined || path === "") return refused(state, "buffer.list: no path given");
  return fromStep(listBuffer(state, path));
}

/**
 * `edit.insert` types the text the action names into the active buffer through the editor. An insert
 * with no text, and one whose text is empty, have nothing to type: both are refusals with a reason,
 * never a silent no-op. A focused terminal window shows a session and no buffer, so there is nothing
 * to type into either (T7a2).
 */
function insertTextAction(
  state: WorkspaceState,
  options: WorkspaceActionOptions,
): WorkspaceActionResult {
  if (terminalFocused(state)) {
    return refused(
      state,
      "edit.insert: the focused window is a terminal, so there is no buffer to edit",
    );
  }
  const text = options.text;
  if (text === undefined) return refused(state, "edit.insert: no text given");
  return fromStep(typeText(state, text));
}

/**
 * Splits the focused window in two and focuses the new pane. A split of one file window shows that
 * buffer twice, exactly as tmux and nvim do; the buffer is still registered once, and `:e` in either
 * pane separates them. A split of a terminal window shows the same session twice, which is what
 * splitting a tmux pane does: the session is one session (T7a1).
 */
function splitFocused(state: WorkspaceState, layout: WindowLayout): WorkspaceActionResult {
  const focused = focusedWindow(state);
  if (focused === undefined) return refused(state, `window.split-${layout}: no focused window`);
  const { tab, node } = focused;
  const root = replaceAt(tab.root, tab.focus, splitNode(layout, DEFAULT_RATIO, node, node));
  return applied(withActiveTab(state, { ...tab, root, focus: [...tab.focus, "second"] }));
}

/**
 * Closes the focused window and hands focus to its sibling's last leaf. The buffer stays open, so
 * the file is still reachable with `:bn`; only the tree and the focus change.
 */
function closeFocused(state: WorkspaceState): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined || tab.focus.length === 0) {
    return refused(state, "window.close: the last window cannot be closed");
  }
  const trimmed = withoutFocusedLeaf(tab);
  if (trimmed === undefined) {
    return refused(state, "window.close: the focus path does not reach a split");
  }
  return applied(withActiveTab(state, trimmed));
}

/**
 * The tab with its focused leaf taken out, focus handed to the sibling's last leaf: the one removal
 * `window.close` and `workspace.move` both need, so closing a window and moving one out of a tab
 * cannot disagree about what is left behind.
 *
 * `undefined` when the tab holds a single window or its focus path does not reach a split: a tab
 * never becomes empty, because a workspace is never nobody's (T7a2).
 */
function withoutFocusedLeaf(tab: WorkspaceTab): WorkspaceTab | undefined {
  if (tab.focus.length === 0) return undefined;
  const parentPath = tab.focus.slice(0, -1);
  const step = tab.focus[tab.focus.length - 1];
  const parent = nodeAt(tab.root, parentPath);
  if (step === undefined || parent === undefined || parent.kind !== "split") return undefined;
  const sibling = step === "first" ? parent.second : parent.first;
  return {
    ...tab,
    root: replaceAt(tab.root, parentPath, sibling),
    focus: [...parentPath, ...lastLeafPath(sibling)],
  };
}

/**
 * Moves focus to the window on the other side of the nearest split whose layout owns that
 * direction, walking out of nested panes as needed. A left/right key in a stacked split finds no
 * side-by-side split on the path and is refused with a reason.
 */
function focusByDirection(
  state: WorkspaceState,
  action: string,
  direction: Direction,
): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, `${action}: no active tab`);
  for (let depth = tab.focus.length - 1; depth >= 0; depth -= 1) {
    const step = tab.focus[depth];
    const ancestor = nodeAt(tab.root, tab.focus.slice(0, depth));
    if (step === undefined || ancestor === undefined || isLeafNode(ancestor)) continue;
    if (ancestor.layout !== direction.layout || step === direction.towards) continue;
    const sibling = step === "first" ? ancestor.second : ancestor.first;
    const focus = [...tab.focus.slice(0, depth), direction.towards, ...lastLeafPath(sibling)];
    return applied(withFocus(state, tab.id, focus));
  }
  return refused(state, `${action}: no ${direction.layout} split on the focus path`);
}

/**
 * Steps the nearest split of the matching layout by 0.05, refusing at the bound instead of
 * clamping: the learner is told the split cannot get any wider, not given a silent no-op.
 */
function resizeFocused(
  state: WorkspaceState,
  action: string,
  layout: WindowLayout,
  direction: 1 | -1,
): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, `${action}: no active tab`);
  for (let depth = tab.focus.length - 1; depth >= 0; depth -= 1) {
    const ancestor = nodeAt(tab.root, tab.focus.slice(0, depth));
    if (ancestor === undefined || ancestor.kind !== "split" || ancestor.layout !== layout) continue;
    const ratio = Math.round((ancestor.ratio + direction * RATIO_STEP) * 100) / 100;
    if (ratio < RATIO_MIN || ratio > RATIO_MAX) {
      const bound = direction > 0 ? "0.9" : "0.1";
      return refused(state, `${action}: the split is already at the ${bound} bound`);
    }
    const root = replaceAt(tab.root, tab.focus.slice(0, depth), { ...ancestor, ratio });
    return applied(withActiveTab(state, { ...tab, root }));
  }
  return refused(state, `${action}: no ${layout} split on the focus path`);
}

/** Zoom is a note on the state, not a shape change: pressing it again restores the layout for free. */
function toggleZoom(state: WorkspaceState): WorkspaceActionResult {
  if (state.zoom !== null) return applied({ ...state, zoom: null });
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, "window.zoom: no focused window");
  return applied({ ...state, zoom: { tabId: tab.id, leafPath: [...tab.focus] } });
}

/** Exchanges the focused window with the nearest sibling leaf's: shape and ratios stay. */
function swapFocused(state: WorkspaceState): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, "window.swap: no active tab");
  const focused = nodeAt(tab.root, tab.focus);
  for (let depth = tab.focus.length - 1; depth >= 0; depth -= 1) {
    const step = tab.focus[depth];
    const ancestor = nodeAt(tab.root, tab.focus.slice(0, depth));
    if (step === undefined || ancestor === undefined || ancestor.kind !== "split") continue;
    const sibling = step === "first" ? ancestor.second : ancestor.first;
    const counterpartPath = [
      ...tab.focus.slice(0, depth),
      step === "first" ? ("second" as const) : ("first" as const),
      ...lastLeafPath(sibling),
    ];
    const counterpart = nodeAt(tab.root, counterpartPath);
    // The windows trade places, not their buffers: a terminal window and a file window swap exactly
    // as two file windows do, so what each one shows moves and the tree does not (T7a1).
    if (focused === undefined || !isLeafNode(focused) || counterpart === undefined) continue;
    if (!isLeafNode(counterpart)) continue;
    const root = replaceAt(replaceAt(tab.root, counterpartPath, focused), tab.focus, counterpart);
    return applied(withActiveTab(state, { ...tab, root }));
  }
  return refused(state, "window.swap: the tab has a single window");
}

/**
 * Opens a file in a new pane beside the focused one. No application is launched: the simulation
 * opens files (S6), so a `window.new` without a path is refused with a reason, and a path that is
 * not on the simulated disk is refused with the message `:e` gives.
 */
function newWindow(state: WorkspaceState, options: WorkspaceActionOptions): WorkspaceActionResult {
  const path = options.path;
  if (path === undefined) {
    return refused(
      state,
      "window.new: no path to open: the simulated workspace opens files, not applications",
    );
  }
  if (state.files[path] === undefined) return refused(state, `E484: Can't open file ${path}`);
  const focused = focusedWindow(state);
  if (focused === undefined) return refused(state, "window.new: no focused window");
  const existing = state.buffers.find((buffer) => buffer.path === path);
  const buffer = existing ?? openBuffer(state.files, path);
  const buffers = existing === undefined ? [...state.buffers, buffer] : state.buffers;
  const next = withPaneBeside(state, focused, leafNode(buffer.id));
  return applied({ ...next, buffers });
}

/**
 * A terminal window is opened beside the focused one and takes the keys (T7a1, story 15). The pane
 * shows a session, so the file window beside it keeps its file and the active buffer does not move.
 *
 * Each launch opens its own session instead of reusing the first one: `Super-Enter` twice is two
 * terminals everywhere, and sharing a scrollback would make one story's commands read in another's.
 */
function launchTerminal(state: WorkspaceState): WorkspaceActionResult {
  const declared = state.declaredTerminal;
  if (declared === null) {
    return refused(state, "app.launch-terminal: the exercise declares no terminal");
  }
  const focused = focusedWindow(state);
  if (focused === undefined) return refused(state, "app.launch-terminal: no focused window");
  const terminal: WorkspaceTerminal = {
    id: nextTerminalId(state.terminals),
    title: declared.title,
    cwd: declared.cwd ?? state.cwd,
    entries: [],
    // A fresh session has an empty prompt: nothing was typed at it yet (T7a3).
    pending: "",
  };
  const next = withPaneBeside(state, focused, terminalNode(terminal.id));
  return applied({ ...next, terminals: [...state.terminals, terminal] });
}

/** Terminal ids come from the position in the state, so the same script gives the same ids. */
function nextTerminalId(terminals: readonly WorkspaceTerminal[]): string {
  let index = terminals.length + 1;
  while (terminals.some((terminal) => terminal.id === `terminal:${index}`)) index += 1;
  return `terminal:${index}`;
}

/**
 * Runs a command in the focused terminal and appends what the exercise declared it prints (T7a1).
 *
 * Nothing is executed (S6): the table is content, so an undeclared command is refused *by name* and
 * never answered with invented text, and a command typed while a file window has the keys is refused
 * too instead of running somewhere the learner is not looking. The action names its command; the
 * terminal's own prompt names it by what was typed (T7a3), and both come through
 * `runInFocusedTerminal`, so the two can never append different entries.
 */
function runShellCommand(
  state: WorkspaceState,
  options: WorkspaceActionOptions,
): WorkspaceActionResult {
  const command = options.command;
  if (command === undefined) return refused(state, "shell.run: no command given");
  return runInFocusedTerminal(state, command);
}

/**
 * The session the keys are on, or `undefined` when the focused window is not a terminal the state
 * holds. One lookup for the action and for the prompt, so neither can address a session the other
 * would not.
 */
export function focusedTerminal(state: WorkspaceState): WorkspaceTerminal | undefined {
  const focused = focusedWindow(state);
  const node = focused?.node;
  if (node === undefined || node.kind !== "terminal") return undefined;
  return state.terminals.find((candidate) => candidate.id === node.terminalId);
}

/**
 * The state with one session replaced, every other session untouched: the one way a terminal changes,
 * so a prompt edit and a command that ran write the same list in the same order.
 */
export function withTerminal(state: WorkspaceState, terminal: WorkspaceTerminal): WorkspaceState {
  return {
    ...state,
    terminals: state.terminals.map((candidate) =>
      candidate.id === terminal.id ? terminal : candidate,
    ),
  };
}

/**
 * Runs `command` in the focused terminal and appends the entry the exercise declared for it (T7a1,
 * T7a3).
 *
 * This is the one body `shell.run` and Enter on a terminal's own command line share: a simulated
 * machine has no processes (S6), so both look the command up in the declaration and both refuse an
 * undeclared one with the same words, naming it. The caller owns the prompt, because the action runs
 * a command the story named and leaves a half-typed line alone, while Enter clears the line it ran.
 */
export function runInFocusedTerminal(
  state: WorkspaceState,
  command: string,
): WorkspaceActionResult {
  const terminal = focusedTerminal(state);
  if (terminal === undefined) {
    return refused(state, "shell.run: the focused window is not a terminal");
  }
  const output = state.declaredTerminal?.commands[command];
  if (output === undefined) {
    return refused(state, `shell.run: no output is declared for ${quoted(command)}`);
  }
  const entries = [...terminal.entries, { command, output: [...output] }];
  return applied(withTerminal(state, { ...terminal, entries }));
}

/** A new tab starts as one window on the buffer that was active, and takes the keys. */
function newTab(state: WorkspaceState): WorkspaceActionResult {
  const tab = activeTab(state);
  if (tab === undefined) return refused(state, "tab.new: no active tab");
  const created: WorkspaceTab = {
    id: nextTabId(state.tabs),
    root: leafNode(state.activeBufferId),
    focus: [],
  };
  return applied(withTabs(state, [...state.tabs, created], created.id));
}

/** Tab ids come from the position in the state, so the same script gives the same ids. */
function nextTabId(tabs: readonly WorkspaceTab[]): string {
  let index = tabs.length + 1;
  while (tabs.some((tab) => tab.id === `tab:${index}`)) index += 1;
  return `tab:${index}`;
}

/** `tab.next` and `tab.previous`, wrapping around like `:bn` and `:bp` do. */
function cycleTab(state: WorkspaceState, offset: 1 | -1): WorkspaceActionResult {
  const current = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
  if (current < 0 || state.tabs.length < 2) return applied(state);
  const target = state.tabs[(current + offset + state.tabs.length) % state.tabs.length];
  if (target === undefined) return applied(state);
  return applied(withTabs(state, state.tabs, target.id));
}

/** `workspace.switch` selects the tab in its options; with none it falls back to cycling. */
function switchTab(state: WorkspaceState, options: WorkspaceActionOptions): WorkspaceActionResult {
  if (options.tabId === undefined) return cycleTab(state, 1);
  const target = state.tabs.find((tab) => tab.id === options.tabId);
  if (target === undefined)
    return refused(state, `workspace.switch: no tab named ${options.tabId}`);
  return applied(withTabs(state, state.tabs, target.id));
}

/**
 * Moves the focused window into another tab, as a split of that tab's root (T7a2, story 17).
 *
 * The window that moves is the focused *leaf*, never the split it sits in, so moving a pane out of a
 * nested tree leaves the rest of that subtree where it was. The tab it leaves keeps its remaining
 * windows: a move that would empty the source tab is refused, because a workspace is never nobody's.
 * The keys stay in the tab the window came from, which is what makes `workspace.switch` the action
 * that brings you back to it.
 */
function moveWindow(state: WorkspaceState, options: WorkspaceActionOptions): WorkspaceActionResult {
  const targetId = options.tabId;
  if (targetId === undefined || targetId === "") {
    return refused(state, "workspace.move: no tab given");
  }
  const source = activeTab(state);
  if (source === undefined) return refused(state, "workspace.move: no active tab");
  if (targetId === source.id) {
    return refused(state, `workspace.move: the focused window is already in ${targetId}`);
  }
  const destination = state.tabs.find((tab) => tab.id === targetId);
  if (destination === undefined) return refused(state, `workspace.move: no tab named ${targetId}`);

  const moved = focusedNode(source);
  if (moved === undefined || !isLeafNode(moved)) {
    return refused(state, "workspace.move: no focused window");
  }
  const trimmed = withoutFocusedLeaf(source);
  if (trimmed === undefined) {
    return refused(
      state,
      "workspace.move: the source tab holds a single window, so moving it would leave it empty",
    );
  }

  const tabs = state.tabs.map((tab) => {
    if (tab.id === source.id) return trimmed;
    if (tab.id !== destination.id) return tab;
    // The arriving window is the second child and the tab's own tree keeps the first one, so the
    // focus path that tab already had still reaches the same window under its new root.
    return {
      ...tab,
      root: splitNode("side-by-side", DEFAULT_RATIO, tab.root, moved),
      focus: ["first" as const, ...tab.focus],
    };
  });
  const next = withTabs(state, tabs, source.id);
  // A zoom names a window inside a tab. The window it named is the one that left, so the note goes
  // with it: the path would otherwise point at whichever window took its place.
  const zoomedMoved =
    state.zoom !== null &&
    state.zoom.tabId === source.id &&
    sameFocus(state.zoom.leafPath, source.focus);
  return applied(zoomedMoved ? { ...next, zoom: null } : next);
}

/**
 * Freezes the workspace (T7a2, story 20). Nothing is closed and nothing is copied: every tab, tree,
 * buffer, terminal, zoom and search stays in the state and the flag refuses the rest, so attaching
 * later finds exactly what detaching left — which is the whole of "detach, reattach, find the editor
 * still open".
 */
function detachSession(state: WorkspaceState): WorkspaceActionResult {
  return applied({ ...state, detached: true });
}

/** Restores a frozen workspace: the state it restores is the one that was frozen, field by field. */
function attachSession(state: WorkspaceState): WorkspaceActionResult {
  return applied({ ...state, detached: false });
}

/** Enters resize mode; entering it when it is already on is a refusal, never a silent no-op. */
function enterResizeMode(state: WorkspaceState, action: string): WorkspaceActionResult {
  if (state.mode === "resize") {
    return refused(state, `${action}: the workspace is already in resize mode`);
  }
  return applied({ ...state, mode: "resize" });
}

/** Leaves resize mode, keeping whatever the resize actions widened: the mode is not the layout. */
function leaveResizeMode(state: WorkspaceState, action: string): WorkspaceActionResult {
  if (state.mode === "normal") {
    return refused(state, `${action}: the workspace is not in resize mode`);
  }
  return applied({ ...state, mode: "normal" });
}
