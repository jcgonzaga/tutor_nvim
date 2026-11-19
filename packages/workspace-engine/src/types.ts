import type { VimState } from "@tutor-nvim/vim-engine";

/**
 * One open buffer: the text, cursor, mode and undo of a file, plus what the workspace knows about it.
 *
 * The editor state is `vim-engine`'s own `VimState`; the workspace never edits text itself, it only
 * holds one per open file and delegates every editing key to that engine (AGENTS.md 2.3).
 */
export interface WorkspaceBuffer {
  /** Stable and derived from the path, so a replay never depends on a clock or randomness. */
  readonly id: string;
  /** Path on the simulated disk: the key of `WorkspaceState.files`. */
  readonly path: string;
  readonly editor: VimState;
  /** True when the buffer differs from the text stored in `files`. */
  readonly modified: boolean;
}

/** Which child of a split a focus path step enters. */
export type FocusStep = "first" | "second";

/**
 * One row a project search found: the file, the line inside it and the line's text.
 *
 * `line` counts from 1, the way a person reads a file and the way `grep -n` prints it, so a story
 * can say "line 3" and mean the same line the tutorial shows.
 */
export interface WorkspaceGrepMatch {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

/**
 * The layout a split produces. Named by the result, because tools disagree on the word "horizontal":
 * tmux `%` leaves panes side by side while Neovim `:split` stacks windows.
 */
export type WindowLayout = "side-by-side" | "stacked";

/**
 * Which input mode the workspace is in (T7a2, story 18): the ordinary one, or the one where the keys
 * resize instead of moving and editing. A mode is a field of the state, not a shape of the tree, so
 * leaving it costs one action and changes no layout.
 */
export type WorkspaceMode = "normal" | "resize";

/** A window showing one buffer. The same buffer may be shown by more than one leaf (a split does). */
export interface LeafWindow {
  readonly kind: "leaf";
  readonly bufferId: string;
}

/**
 * A window showing a terminal session instead of a file (T7a1, stories 15 and 19).
 *
 * A session is not a file and not a buffer: it has a scrollback in `WorkspaceState.terminals`, it is
 * never edited and no `:` command opens it. Keeping it a *leaf* is what makes focus, split, zoom,
 * resize, swap and close work on it with no special case: every window shows one thing, and only
 * what it shows differs.
 */
export interface TerminalWindow {
  readonly kind: "terminal";
  readonly terminalId: string;
}

/** Two windows, one on each side or one above the other, with the share the first one takes. */
export interface SplitWindow {
  readonly kind: "split";
  readonly layout: WindowLayout;
  /** Share of the tab the first child takes, inside [0.1, 0.9]: a ratio, never pixels. */
  readonly ratio: number;
  readonly first: WindowNode;
  readonly second: WindowNode;
}

/** The window tree of one tab: leaves are windows, splits are the layout between them. */
export type WindowNode = LeafWindow | SplitWindow | TerminalWindow;

/**
 * The node kinds nothing sits under: a window shows one thing, so the pair is what focus, printing
 * and swapping treat as "a leaf", whatever that leaf shows.
 */
export type WindowLeaf = LeafWindow | TerminalWindow;

/** One tab: a tree plus the path from its root to the focused leaf. */
export interface WorkspaceTab {
  /** Stable and derived from the position in the state, so a replay is the same state. */
  readonly id: string;
  readonly root: WindowNode;
  /** The path from the root to the leaf holding the keys: `[]` is a tab of one window. */
  readonly focus: readonly FocusStep[];
}

/**
 * The window filling the tab, if any. Zooming changes nothing in the tree, so restoring it is free:
 * the zoom is a note beside the tree, not a shape of it.
 */
export interface WorkspaceZoom {
  readonly tabId: string;
  readonly leafPath: readonly FocusStep[];
}

/**
 * Half-typed command, mirroring `vim-engine`'s `PendingCommand`: `:` opens the command line and
 * printable keys and Backspace edit `text` until Enter runs it or Esc drops it.
 */
export interface PendingWorkspaceCommand {
  readonly kind: "command-line";
  /** What was typed after the `:`, e.g. `e src/main.ts`. */
  readonly text: string;
}

/** Result of the last executed command line, kept for the UI instead of failing silently. */
export interface WorkspaceCommandResult {
  /** The line as typed after the `:`, trimmed. */
  readonly command: string;
  readonly accepted: boolean;
  /** Lines the command printed (only `:ls` prints); empty otherwise. */
  readonly output: readonly string[];
  /** Why the command was rejected; absent when it was accepted. */
  readonly reason?: string;
}

/**
 * The simulated workspace: the files on disk, the open buffers, which one is active, where the open
 * buffers are shown and what the last project search found.
 *
 * Plain data, no clock, no I/O and no globals, so a story can be replayed in a test without a
 * browser. `activeBufferId` always names an open buffer and always follows the focused window of
 * the active tab, because opening the workspace opens one.
 */
export interface WorkspaceState {
  /** The simulated disk: path -> text. Nothing here touches a real filesystem. */
  readonly files: Readonly<Record<string, string>>;
  /** Where a shell command would run. Carried for later tasks; T1 runs no shell command. */
  readonly cwd: string;
  /** Open buffers, in the order they were opened. A buffer is registered here once. */
  readonly buffers: readonly WorkspaceBuffer[];
  readonly activeBufferId: string;
  /**
   * The rows the last `grep.project` recorded, in project order (path, then line) and never ranked:
   * an objective asserts them as `grep_matches`, and a search that found nothing is a refusal, so
   * this holds rows or nothing. Empty until a project search runs.
   */
  readonly matches: readonly WorkspaceGrepMatch[];
  /** One per tab, in the order they were opened; a tab holds the window tree of that tab. */
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: string;
  /** The window a `window.zoom` selected, or `null`; the tree itself is never changed by zooming. */
  readonly zoom: WorkspaceZoom | null;
  /**
   * Whether the session is frozen (`session.detach`, T7a2). Detaching keeps every tab, tree, buffer,
   * terminal and zoom in this state and refuses every action but attaching, so coming back finds
   * exactly what was left: story 20 is this one flag.
   */
  readonly detached: boolean;
  /**
   * The input mode: the ordinary one, or resize mode, where only the resize actions and leaving it
   * apply (T7a2). A field beside the tree, so a mode change never touches a layout.
   */
  readonly mode: WorkspaceMode;
  readonly pending: PendingWorkspaceCommand | null;
  readonly lastCommand: WorkspaceCommandResult | null;
  /**
   * The terminal the exercise declares, or `null` when it declares none (T7a1). It is what
   * `app.launch-terminal` opens and where `shell.run` reads the outputs, so an exercise without one
   * cannot open a terminal at all — a refusal, never an invented session.
   */
  readonly declaredTerminal: WorkspaceTerminalDeclaration | null;
  /**
   * The terminal sessions this workspace opened, in the order they were opened. A session outlives
   * the window that showed it, exactly as a buffer outlives the window that showed the file.
   */
  readonly terminals: readonly WorkspaceTerminal[];
}

/** One line a terminal printed, and the command that printed it. */
export interface WorkspaceTerminalEntry {
  /** The command as it was run, so the scrollback reads as a session. */
  readonly command: string;
  /** What it printed, line by line. The exercise declared this text; the engine invents none. */
  readonly output: readonly string[];
}

/**
 * One terminal session: what a terminal window shows (T7a1).
 *
 * A session is not a buffer: nothing edits it, nothing saves it, and it holds the scrollback of the
 * commands it has run. Its id comes from the order it was opened in, never from a clock or from
 * randomness, so a replay is the same state.
 */
export interface WorkspaceTerminal {
  /** Stable and derived from how many terminals came before it. */
  readonly id: string;
  readonly title: string;
  /** Where its commands would run: the shell's working directory, carried but never executed. */
  readonly cwd: string;
  /** The commands it ran, in the order it ran them. */
  readonly entries: readonly WorkspaceTerminalEntry[];
  /**
   * The line being typed at its prompt, empty when idle (T7a3).
   *
   * A terminal is a prompt, not a log (story 19: "run the tests there"), so each session carries
   * what was typed to it and nothing else: printable keys append, Backspace and Esc edit it, and
   * Enter runs it through the same path `shell.run` uses. Kept per terminal, because two sessions
   * are two prompts, exactly as two command lines would be.
   */
  readonly pending: string;
}

/**
 * The terminal an exercise declares (`initialState.terminal`): the title, where it opens and, above
 * all, what the simulated machine prints for each command.
 *
 * The table is content because a simulated machine has no processes (S6): `shell.run` looks a command
 * up here and appends what it finds, so the engine never invents output and a command the exercise never
 * declared is refused by name instead of answered with fiction.
 */
export interface WorkspaceTerminalDeclaration {
  readonly title: string;
  /** Where it opens; `null` means the workspace's own `cwd`. */
  readonly cwd: string | null;
  /** command -> the lines it prints. */
  readonly commands: Readonly<Record<string, readonly string[]>>;
}

/** What `createWorkspace` needs: the simulated disk, the path to open first and the cwd. */
export interface WorkspaceInit {
  readonly files: Readonly<Record<string, string>>;
  readonly path: string;
  readonly cwd: string;
  /** The terminal the exercise declares, if any: without one no terminal window can open (T7a1). */
  readonly terminal?: WorkspaceTerminalDeclaration | null;
}

export interface WorkspaceDispatchResult {
  readonly state: WorkspaceState;
  /**
   * `true` when the workspace recognized the key: an editing key the editor accepted, a command
   * line step, or a command that ran (wrapped around to the same buffer included). A key nobody
   * consumed and a command that failed are `false`; a failed command still records its reason.
   */
  readonly accepted: boolean;
  /**
   * Why the key was refused; absent when it was accepted.
   *
   * A key refused by a state that freezes input says the same words its action says (T7a3), because
   * the terminal's prompt runs the terminal's action: a detached workspace refuses a typed character
   * with `shell.run`'s own refusal instead of making the learner guess why nothing appeared.
   */
  readonly reason?: string;
}

/** What a window or file action may need: the tab to select and the path it acts on. */
export interface WorkspaceActionOptions {
  /** `workspace.switch`: the tab to select. Without it the action cycles to the next tab. */
  readonly tabId?: string;
  /**
   * The file the action names: `window.new` shows it in the new pane, `file.open` opens it and
   * `file.new` starts a buffer for it. No dialog is modelled, so the caller supplies it (S6).
   */
  readonly path?: string;
  /**
   * What `edit.insert` types. A solution carries the words the way a file action carries its path,
   * because a binding names keys and can never name the text a story asks for (L9).
   */
  readonly text?: string;
  /**
   * What `file.find` and `grep.project` search for: the fragment the learner types, matched
   * against the fixed project without scoring or ranking (T5c). A story carries it the way it
   * carries a path, because a binding names keys and can never name the query.
   */
  readonly query?: string;
  /**
   * What `shell.run` runs: the command whose declared output is appended to the focused terminal
   * (T7a1). A story carries it the way it carries a path, because a binding names keys and can
   * never name the command.
   */
  readonly command?: string;
}

export interface WorkspaceActionResult {
  readonly state: WorkspaceState;
  /** `false` when the action could not apply; `state` is then the same object it was given. */
  readonly applied: boolean;
  /** Why the action could not apply. Absent when it did. */
  readonly reason?: string;
}
