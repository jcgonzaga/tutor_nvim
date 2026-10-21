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

/** Operators of the command grammar. Only `change` exists in the M1 subset. */
export type Operator = "change";

export type TextObjectModifier = "inner";

/**
 * Partially entered command, as a discriminated union so the grammar can grow
 * (`d`, `y`, `a"`, counts, motions...) without reshaping the state.
 */
export type PendingCommand =
  | { readonly kind: "operator"; readonly operator: Operator }
  | {
      readonly kind: "text-object";
      readonly operator: Operator;
      readonly modifier: TextObjectModifier;
    };

export interface VimState {
  readonly mode: VimMode;
  readonly buffer: TextBuffer;
  readonly cursor: Position;
  readonly pending: PendingCommand | null;
}

export interface DispatchResult {
  readonly state: VimState;
  /**
   * `true` when the engine recognized the input as a valid step of a supported
   * command in the current context. Recognized no-ops (Esc in NORMAL) are
   * accepted; unsupported keys and failed commands (`ci"` with no quotes) are
   * not. A rejected input also cancels any pending command, like Vim.
   */
  readonly accepted: boolean;
}
