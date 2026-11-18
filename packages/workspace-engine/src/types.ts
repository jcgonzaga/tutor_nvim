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
 * The simulated workspace: the files on disk, the open buffers and which one is active.
 *
 * Plain data, no clock, no I/O and no globals, so a story can be replayed in a test without a
 * browser. `activeBufferId` always names an open buffer, because opening the workspace opens one.
 */
export interface WorkspaceState {
  /** The simulated disk: path -> text. Nothing here touches a real filesystem. */
  readonly files: Readonly<Record<string, string>>;
  /** Where a shell command would run. Carried for later tasks; T1 runs no shell command. */
  readonly cwd: string;
  /** Open buffers, in the order they were opened. */
  readonly buffers: readonly WorkspaceBuffer[];
  readonly activeBufferId: string;
  readonly pending: PendingWorkspaceCommand | null;
  readonly lastCommand: WorkspaceCommandResult | null;
}

/** What `createWorkspace` needs: the simulated disk, the path to open first and the cwd. */
export interface WorkspaceInit {
  readonly files: Readonly<Record<string, string>>;
  readonly path: string;
  readonly cwd: string;
}

export interface WorkspaceDispatchResult {
  readonly state: WorkspaceState;
  /**
   * `true` when the workspace recognized the key: an editing key the editor accepted, a command
   * line step, or a command that ran (wrapped around to the same buffer included). A key nobody
   * consumed and a command that failed are `false`; a failed command still records its reason.
   */
  readonly accepted: boolean;
}
