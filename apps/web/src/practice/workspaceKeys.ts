import type { KeymapAction, KeymapMode, KeymapSurface } from "@tutor-nvim/exercise-schema";
import {
  IDLE_KEYMAP_STATE,
  resolveKeymapKey,
  type KeymapCatalog,
  type KeymapState,
} from "@tutor-nvim/keymap";
import type { KeyInput } from "@tutor-nvim/vim-engine";
import { keyInputToKeymapToken } from "../input/keymap-notation";
import {
  WORKSPACE_ACTIONS,
  WORKSPACE_EDIT_ACTIONS,
  WORKSPACE_FILE_ACTIONS,
  WORKSPACE_PICKER_ACTIONS,
  WORKSPACE_SESSION_ACTIONS,
  WORKSPACE_TERMINAL_ACTIONS,
  activeTab,
  focusedNode,
  type WorkspaceState,
} from "./workspaceEngine";

/**
 * Which key means what in a workspace exercise (T8).
 *
 * There are two ways a key can matter in the simulated workspace: it can be an action a layer
 * claims (a split, a tab, a session), or it can be text the editor or a terminal prompt wants. Only
 * the first is resolved here. Everything else falls through untouched to `dispatchWorkspace`, which
 * is what types into the focused buffer or the focused terminal's command line — the same key path
 * the engine already documents (T1, T7a3), so the view adds a resolver and never a second editor.
 *
 * Pure: no React, no state of its own. The caller keeps the `KeymapState` between presses because a
 * resolved action can cost several keys (tmux's `C-b` then `%`).
 */

/**
 * The actions the workspace engine can apply. A layer can also resolve a key to an action of
 * another engine (`motion.left`, `edit.delete`), and those must reach the buffer rather than be
 * recorded as a workspace action the engine would refuse: an enabled nvim layer is how a learner
 * *edits*, so claiming their `h` would break typing.
 */
const APPLIED_ACTIONS: ReadonlySet<string> = new Set<string>([
  ...WORKSPACE_ACTIONS,
  ...WORKSPACE_FILE_ACTIONS,
  ...WORKSPACE_PICKER_ACTIONS,
  ...WORKSPACE_EDIT_ACTIONS,
  ...WORKSPACE_TERMINAL_ACTIONS,
  ...WORKSPACE_SESSION_ACTIONS,
]);

/** What one key press does to the workspace. */
export interface WorkspaceKeyDecision {
  /** The resolver's state after this key: an opener stays open across presses. */
  readonly keymap: KeymapState;
  /** The workspace action the key completed, when a layer claims it and the engine can apply it. */
  readonly action: KeymapAction | null;
  /** Whether the key goes on to `dispatchWorkspace` (text, and every key no layer claimed). */
  readonly dispatch: boolean;
  /** The key opened a sequence that is still incomplete: nothing else happens yet. */
  readonly pending: boolean;
}

export function resolveWorkspaceKey(
  keymap: KeymapState,
  input: KeyInput,
  catalogs: readonly KeymapCatalog[],
  mode: KeymapMode,
): WorkspaceKeyDecision {
  const token = keyInputToKeymapToken(input);
  // A press the catalog notation cannot write (`S-` chords arrive as the character produced) is not
  // something a layer can claim: it is text, and it reaches the engine as it did before.
  if (token === null) return { keymap, action: null, dispatch: true, pending: false };

  const outcome = resolveKeymapKey(keymap, token, catalogs, { mode });
  if (outcome.kind === "pending") {
    return { keymap: outcome.state, action: null, dispatch: false, pending: true };
  }
  if (outcome.kind === "action") {
    if (APPLIED_ACTIONS.has(outcome.action)) {
      return { keymap: IDLE_KEYMAP_STATE, action: outcome.action, dispatch: false, pending: false };
    }
    // A layer claimed it for another engine: the workspace's own key path still needs it.
    return { keymap: IDLE_KEYMAP_STATE, action: null, dispatch: true, pending: false };
  }
  return { keymap: IDLE_KEYMAP_STATE, action: null, dispatch: true, pending: false };
}

/**
 * Which surface has the keys: a terminal window is the shell's prompt, anything else is the editor.
 * The catalogs are ordered by it (`captureOrder`), so tmux and Herdr answer first at a terminal.
 */
export function focusedSurface(state: WorkspaceState): KeymapSurface {
  const tab = activeTab(state);
  const node = tab === undefined ? undefined : focusedNode(tab);
  return node !== undefined && node.kind === "terminal" ? "shell" : "editor";
}

/**
 * The mode the resolver reads: a terminal's prompt has no Vim mode, so it resolves as NORMAL, and a
 * buffer resolves in the mode it is in. A binding declared for NORMAL does not fire in INSERT, which
 * is the same rule the editor already follows.
 */
export function resolverMode(state: WorkspaceState): KeymapMode {
  if (focusedSurface(state) === "shell") return "normal";
  const buffer = state.buffers.find((candidate) => candidate.id === state.activeBufferId);
  return buffer?.editor.mode ?? "normal";
}
