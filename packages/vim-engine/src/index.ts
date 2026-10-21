export type {
  CharSearch,
  CharSearchKind,
  DesiredColumn,
  DispatchResult,
  InsertSession,
  KeyInput,
  Operator,
  PendingCommand,
  Position,
  Range,
  Register,
  RepeatState,
  TextBuffer,
  TextObjectModifier,
  UndoEntry,
  VimMode,
  VimState,
} from "./types";
export {
  bufferFromLines,
  bufferToText,
  comparePositions,
  createBuffer,
  deleteRange,
  insertText,
  isValidPosition,
  lineCount,
  normalizeCursor,
  readLine,
  replaceRange,
  splitLines,
} from "./buffer";
export {
  KeySequenceError,
  formatKey,
  keyInputFromToken,
  parseKeySequence,
  tokenizeKeySequence,
} from "./keys";
export { findQuotedSpan, type ColumnSpan } from "./text-objects";
export { createVimState, dispatch, pendingKeys, runKeys, type InitialVimState } from "./engine";
