/**
 * Core editor types. Everything here is plain data: the engine is a pure
 * `(state, key) -> state` function with no framework, DOM or I/O dependency.
 */

/** Zero-based cursor/text position. `column` is a UTF-16 code unit offset. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

/** Half-open range: `start` inclusive, `end` exclusive. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}

export interface TextBuffer {
  /** Always at least one line; an "empty" buffer is `[""]`. */
  readonly lines: readonly string[];
}

export type VimMode = "normal" | "insert";

/**
 * Logical input consumed by the engine. Browser specifics (`KeyboardEvent`)
 * are normalized by an adapter; both `key` (logical) and `code` (physical) are
 * preserved so keyboard-layout behavior can be analysed later.
 */
export interface KeyInput {
  readonly key: string;
  readonly code?: string;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
  readonly meta?: boolean;
  readonly timestamp?: number;
}

/** Operators of the command grammar. */
export type Operator = "delete" | "change" | "yank";

export type TextObjectModifier = "inner" | "around";

export type CharSearchKind = "find" | "till";

/** Last `f`/`t` search, replayed by `;` and `,`. */
export interface CharSearch {
  readonly kind: CharSearchKind;
  readonly char: string;
  readonly direction: "forward" | "backward";
}

/**
 * Partially entered command, as a discriminated union so the grammar can grow
 * (counts, more motions, registers...) without reshaping the state.
 */
export type PendingCommand =
  | { readonly kind: "operator"; readonly operator: Operator }
  | {
      readonly kind: "text-object";
      readonly operator: Operator;
      readonly modifier: TextObjectModifier;
    }
  /** Waiting for the target character of `f`/`t`, optionally under an operator. */
  | {
      readonly kind: "char-search";
      readonly operator: Operator | null;
      readonly search: CharSearchKind;
    };

/** Column `j`/`k` aim for; `"end"` after `$`. Survives short lines in between. */
export type DesiredColumn = number | "end";

/** The unnamed register. `text` has no trailing newline, even when `linewise`. */
export interface Register {
  readonly text: string;
  readonly linewise: boolean;
}

/**
 * One undoable change. `cursor` is where Vim records the cursor when the change
 * began; it is reused for both undo and redo.
 */
export interface UndoEntry {
  readonly before: TextBuffer;
  readonly after: TextBuffer;
  readonly cursor: Position;
}

/** An INSERT session is one undo step, together with the command that started it. */
export interface InsertSession {
  readonly before: TextBuffer;
  /** `null` until the first modification, which records the cursor at that moment. */
  readonly cursor: Position | null;
}

/** Keys of the last repeatable change (for `.`) and of the one being typed. */
export interface RepeatState {
  readonly last: readonly KeyInput[] | null;
  readonly recording: readonly KeyInput[] | null;
}

export interface VimState {
  readonly mode: VimMode;
  readonly buffer: TextBuffer;
  readonly cursor: Position;
  readonly desiredColumn: DesiredColumn;
  readonly pending: PendingCommand | null;
  readonly register: Register | null;
  readonly charSearch: CharSearch | null;
  readonly undoStack: readonly UndoEntry[];
  readonly redoStack: readonly UndoEntry[];
  readonly insertSession: InsertSession | null;
  readonly repeat: RepeatState;
}

export interface DispatchResult {
  readonly state: VimState;
  /**
   * `true` when the engine recognized the input as a valid step of a supported
   * command in the current context. Recognized no-ops (Esc in NORMAL) are
   * accepted; unsupported keys and failed commands (`ci"` with no quotes, `w` on
   * the last character) are not. A rejected input also cancels any pending
   * command, like Vim.
   */
  readonly accepted: boolean;
}
