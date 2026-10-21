import {
  bufferFromLines,
  firstNonBlankColumn,
  insertText,
  leadingBlanks,
  normalizeCursor,
  readLine,
  replaceRange,
  sameLines,
} from "./buffer";
import {
  MOTIONS,
  MOVE_RIGHT,
  newCharSearch,
  reverseSearch,
  searchChar,
  type MotionEnv,
  type MotionResult,
} from "./motions";
import {
  currentLineRange,
  finalizeRange,
  isEmptyRange,
  rawRangeFromMotion,
  regionContents,
  type RawRange,
  type Region,
} from "./regions";
import { TEXT_OBJECTS } from "./text-objects";
import type {
  CharSearchKind,
  DispatchResult,
  InsertSession,
  KeyInput,
  Operator,
  PendingCommand,
  Position,
  TextBuffer,
  TextObjectModifier,
  UndoEntry,
  VimMode,
  VimState,
} from "./types";

export interface InitialVimState {
  readonly lines: readonly string[];
  readonly cursor?: Position;
  readonly mode?: VimMode;
}

export function createVimState(initial: InitialVimState): VimState {
  const buffer = bufferFromLines(initial.lines);
  const mode = initial.mode ?? "normal";
  const cursor = normalizeCursor(buffer, initial.cursor ?? { line: 0, column: 0 }, mode);
  return {
    mode,
    buffer,
    cursor,
    desiredColumn: cursor.column,
    pending: null,
    register: null,
    charSearch: null,
    undoStack: [],
    redoStack: [],
    insertSession: mode === "insert" ? { before: buffer, cursor: null } : null,
    repeat: { last: null, recording: null },
  };
}

// --- grammar tables ------------------------------------------------------------------------------

const OPERATOR_KEYS: Readonly<Record<string, Operator>> = { d: "delete", c: "change", y: "yank" };
const TEXT_OBJECT_MODIFIERS: Readonly<Record<string, TextObjectModifier>> = {
  i: "inner",
  a: "around",
};
const CHAR_SEARCH_KEYS: Readonly<Record<string, CharSearchKind>> = { f: "find", t: "till" };

/** Table lookup that cannot be fooled by keys such as `constructor`. */
function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function keyFor<T extends string>(table: Readonly<Record<string, T>>, value: T): string {
  return Object.entries(table).find(([, candidate]) => candidate === value)?.[0] ?? "";
}

/** The keys typed so far for a half-entered command (`c`, `ci`, `df`), for display. */
export function pendingKeys(pending: PendingCommand | null): string {
  if (pending === null) return "";
  switch (pending.kind) {
    case "operator":
      return keyFor(OPERATOR_KEYS, pending.operator);
    case "text-object":
      return (
        keyFor(OPERATOR_KEYS, pending.operator) + keyFor(TEXT_OBJECT_MODIFIERS, pending.modifier)
      );
    case "char-search":
      return (
        (pending.operator === null ? "" : keyFor(OPERATOR_KEYS, pending.operator)) +
        keyFor(CHAR_SEARCH_KEYS, pending.search)
      );
  }
}

// --- step plumbing -------------------------------------------------------------------------------

interface Step {
  readonly state: VimState;
  readonly accepted: boolean;
  /** The command completed a repeatable change (for `.`). */
  readonly change?: boolean;
}

const done = (state: VimState, change = false): Step => ({
  state: { ...state, pending: null },
  accepted: true,
  change,
});

/** Unsupported or failed input: cancel any half-typed command. */
const fail = (state: VimState): Step => ({ state: { ...state, pending: null }, accepted: false });

const withCursor = (state: VimState, cursor: Position): VimState => ({
  ...state,
  cursor,
  desiredColumn: cursor.column,
});

const isEscape = (input: KeyInput): boolean => input.key === "Escape";
const hasCommandModifiers = (input: KeyInput): boolean =>
  input.ctrl === true || input.alt === true || input.meta === true;

/** A single typed character (one code point); layout-composed characters included. */
const isPrintable = (input: KeyInput): boolean =>
  !hasCommandModifiers(input) && [...input.key].length === 1;

const lineText = (state: VimState, line = state.cursor.line): string =>
  readLine(state.buffer, line);

function motionEnv(state: VimState, operator: Operator | null): MotionEnv {
  return {
    lines: state.buffer.lines,
    cursor: state.cursor,
    desiredColumn: state.desiredColumn,
    operator,
    charSearch: state.charSearch,
  };
}

// --- undo ----------------------------------------------------------------------------------------

/** Records a finished change; `cursor` is where Vim notes the cursor for undo/redo. */
function commit(state: VimState, before: TextBuffer, cursor: Position, force = false): VimState {
  if (!force && sameLines(before, state.buffer)) return state;
  const entry: UndoEntry = { before, after: state.buffer, cursor };
  return { ...state, undoStack: [...state.undoStack, entry], redoStack: [] };
}

function firstDifferingLine(a: TextBuffer, b: TextBuffer): number | null {
  const shared = Math.min(a.lines.length, b.lines.length);
  for (let line = 0; line < shared; line++) if (a.lines[line] !== b.lines[line]) return line;
  return a.lines.length === b.lines.length ? null : shared;
}

/** Where Vim puts the cursor after undo/redo: the first changed line, at the recorded column if it is that line. */
function restoredCursor(from: TextBuffer, target: TextBuffer, recorded: Position): Position {
  let line = firstDifferingLine(from, target) ?? recorded.line;
  if (recorded.line + 1 === line && line > 0) line--;

  if (line >= target.lines.length) {
    // The change was past the end (e.g. the last line was removed): land on the new last line.
    const last = target.lines.length - 1;
    return { line: last, column: firstNonBlankColumn(target.lines[last] ?? "") };
  }
  const column = recorded.line === line ? recorded.column : firstNonBlankColumn(target.lines[line] ?? "");
  return normalizeCursor(target, { line, column }, "normal");
}

function undo(state: VimState): Step {
  const entry = state.undoStack[state.undoStack.length - 1];
  if (entry === undefined) return fail(state);
  const cursor = restoredCursor(state.buffer, entry.before, entry.cursor);
  return done({
    ...withCursor(state, cursor),
    buffer: entry.before,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, entry],
  });
}

function redo(state: VimState): Step {
  const entry = state.redoStack[state.redoStack.length - 1];
  if (entry === undefined) return fail(state);
  const cursor = restoredCursor(state.buffer, entry.after, entry.cursor);
  return done({
    ...withCursor(state, cursor),
    buffer: entry.after,
    redoStack: state.redoStack.slice(0, -1),
    undoStack: [...state.undoStack, entry],
  });
}

// --- INSERT mode ---------------------------------------------------------------------------------

function enterInsert(
  state: VimState,
  buffer: TextBuffer,
  cursor: Position,
  session: InsertSession,
): VimState {
  return { ...withCursor(state, cursor), mode: "insert", buffer, pending: null, insertSession: session };
}

/** Applies an edit made while typing; the first one fixes the cursor recorded for undo. */
function typed(state: VimState, buffer: TextBuffer, cursor: Position): Step {
  const session = state.insertSession ?? { before: state.buffer, cursor: null };
  return done({
    ...withCursor(state, cursor),
    buffer,
    insertSession: { ...session, cursor: session.cursor ?? state.cursor },
  });
}

function stepInsert(state: VimState, input: KeyInput): Step {
  if (isEscape(input)) {
    const session = state.insertSession;
    const settled = session
      ? commit(state, session.before, session.cursor ?? state.cursor, session.touched === true)
      : state;
    const cursor = { line: state.cursor.line, column: Math.max(state.cursor.column - 1, 0) };
    return done(
      { ...withCursor(settled, cursor), mode: "normal", insertSession: null },
      true,
    );
  }

  if (input.key === "Enter" && !hasCommandModifiers(input)) {
    const result = insertText(state.buffer, state.cursor, "\n");
    return typed(state, result.buffer, result.end);
  }

  if (isPrintable(input)) {
    const result = insertText(state.buffer, state.cursor, input.key);
    return typed(state, result.buffer, result.end);
  }

  return { state, accepted: false };
}

// --- operators -----------------------------------------------------------------------------------

/**
 * A multi-line charwise delete that starts in the indent and ends with only
 * blanks left on its last line deletes whole lines (Vim's `op_delete`).
 */
function promoteToLines(lines: readonly string[], region: Region): Region {
  if (region.kind !== "char" || region.start.line === region.end.line) return region;
  const rest = (lines[region.end.line] ?? "").slice(region.end.column);
  const startsInIndent = leadingBlanks(lines[region.start.line] ?? "") >= region.start.column;
  if (!/^[ \t]*$/.test(rest) || !startsInIndent) return region;
  return { kind: "line", startLine: region.start.line, endLine: region.end.line, anchor: region.start };
}

function applyOperator(state: VimState, operator: Operator, raw: RawRange): Step {
  const lines = state.buffer.lines;
  const finalized = finalizeRange(lines, raw);
  const region = operator === "delete" ? promoteToLines(lines, finalized) : finalized;
  const contents = regionContents(lines, region);
  const before = state.buffer;

  if (operator === "yank") {
    // Yanking nothing still empties the register, as in Vim.
    const target = region.kind === "line" ? region.anchor : region.start;
    return done({
      ...withCursor(state, normalizeCursor(state.buffer, target, "normal")),
      register: contents,
    });
  }

  // Vim's "empty region": an exclusive range with no characters. Nothing is deleted or
  // registered, but the cursor still goes to the start of the range.
  if (isEmptyRange(raw)) {
    // Vim still takes an undo snapshot, so `u` right after is a visible no-op.
    const at = normalizeCursor(state.buffer, region.kind === "line" ? region.anchor : region.start, operator === "change" ? "insert" : "normal");
    return operator === "change"
      ? done(enterInsert(state, state.buffer, at, { before, cursor: at, touched: true }), true)
      : done(commit(withCursor(state, at), before, at, true), true);
  }

  // Deleting characters from an empty line is a silent no-op that leaves the register alone.
  const nothingToDelete =
    region.kind === "char" && region.start.line === region.end.line && (lines[region.start.line] ?? "") === "";
  const register = operator === "delete" && nothingToDelete ? state.register : contents;
  // For linewise changes Vim records the original column, capped at the first non-blank.
  const lineUndoCursor = (startLine: number): Position => ({
    line: startLine,
    column: Math.min(state.cursor.column, firstNonBlankColumn(lines[startLine] ?? "")),
  });

  if (region.kind === "line") {
    if (operator === "change") {
      const buffer = bufferFromLines([
        ...lines.slice(0, region.startLine),
        "",
        ...lines.slice(region.endLine + 1),
      ]);
      return done(
        enterInsert({ ...state, register }, buffer, { line: region.startLine, column: 0 }, {
          before,
          cursor: lineUndoCursor(region.startLine),
          touched: true,
        }),
        true,
      );
    }
    const buffer = bufferFromLines([...lines.slice(0, region.startLine), ...lines.slice(region.endLine + 1)]);
    const line = Math.min(region.startLine, buffer.lines.length - 1);
    const cursor = { line, column: firstNonBlankColumn(buffer.lines[line] ?? "") };
    return done(
      commit({ ...withCursor(state, cursor), buffer, register }, before, lineUndoCursor(region.startLine)),
      true,
    );
  }

  const { buffer } = replaceRange(state.buffer, region.start, region.end, "");
  if (operator === "change") {
    return done(
      enterInsert({ ...state, register }, buffer, region.start, { before, cursor: region.start, touched: true }),
      true,
    );
  }
  const cursor = normalizeCursor(buffer, region.start, "normal");
  return done(commit({ ...withCursor(state, cursor), buffer, register }, before, region.start), true);
}

/** `p`/`P`. */
function put(state: VimState, before: boolean): Step {
  const register = state.register;
  if (register === null) return fail(state);
  const lines = state.buffer.lines;
  const { line, column } = state.cursor;

  if (register.linewise) {
    const at = before ? line : line + 1;
    const inserted = register.text.split("\n");
    const buffer = bufferFromLines([...lines.slice(0, at), ...inserted, ...lines.slice(at)]);
    const cursor = { line: at, column: firstNonBlankColumn(inserted[0] ?? "") };
    return done(commit({ ...withCursor(state, cursor), buffer }, state.buffer, state.cursor), true);
  }

  const insertAt = { line, column: before || lineText(state) === "" ? column : column + 1 };
  const result = insertText(state.buffer, insertAt, register.text);
  const cursor = normalizeCursor(
    result.buffer,
    register.text.includes("\n") ? insertAt : { line, column: result.end.column - 1 },
    "normal",
  );
  return done(commit({ ...withCursor(state, cursor), buffer: result.buffer }, state.buffer, state.cursor), true);
}

// --- NORMAL mode ---------------------------------------------------------------------------------

function moveTo(state: VimState, result: MotionResult): Step {
  const cursor = normalizeCursor(state.buffer, result.position, "normal");
  const moved = { ...withCursor(state, cursor), desiredColumn: result.desiredColumn ?? cursor.column };
  return result.ok ? done(moved) : { ...fail(moved) };
}

/** Runs a motion, either moving the cursor or feeding the pending operator. */
function applyMotion(state: VimState, operator: Operator | null, result: MotionResult, proceedOnFail: boolean): Step {
  if (operator === null) return moveTo(state, result);
  if (!result.ok && !proceedOnFail) return fail(state);
  return applyOperator(state, operator, rawRangeFromMotion(state.cursor, result));
}

function charSearchStep(state: VimState, operator: Operator | null, kind: CharSearchKind, char: string): Step {
  const search = newCharSearch(kind, char);
  const withSearch = { ...state, charSearch: search };
  return applyMotion(withSearch, operator, searchChar(motionEnv(withSearch, operator), search, false), false);
}

function repeatSearchStep(state: VimState, operator: Operator | null, reversed: boolean): Step {
  const last = state.charSearch;
  if (last === null) return fail(state);
  const search = reversed ? reverseSearch(last) : last;
  return applyMotion(state, operator, searchChar(motionEnv(state, operator), search, true), false);
}

function stepPending(state: VimState, pending: PendingCommand, input: KeyInput): Step {
  const key = input.key;

  if (pending.kind === "char-search") {
    return isPrintable(input)
      ? charSearchStep(state, pending.operator, pending.search, key)
      : fail(state);
  }

  if (pending.kind === "text-object") {
    const finder = own(TEXT_OBJECTS[pending.modifier], key);
    if (finder === undefined) return fail(state);
    const raw = finder({ lines: state.buffer.lines, cursor: state.cursor });
    return raw === null ? fail(state) : applyOperator(state, pending.operator, raw);
  }

  const { operator } = pending;
  if (own(OPERATOR_KEYS, key) === operator) {
    return applyOperator(state, operator, currentLineRange(state.cursor));
  }

  const modifier = own(TEXT_OBJECT_MODIFIERS, key);
  if (modifier !== undefined) {
    return { state: { ...state, pending: { kind: "text-object", operator, modifier } }, accepted: true };
  }

  return stepMotionKey(state, operator, key);
}

/** Motion keys shared by plain NORMAL mode and operator-pending mode. */
function stepMotionKey(state: VimState, operator: Operator | null, key: string): Step {
  const search = own(CHAR_SEARCH_KEYS, key);
  if (search !== undefined) {
    return {
      state: { ...state, pending: { kind: "char-search", operator, search } },
      accepted: true,
    };
  }
  if (key === ";" || key === ",") return repeatSearchStep(state, operator, key === ",");

  const motion = own(MOTIONS, key);
  if (motion === undefined) return fail(state);
  return applyMotion(state, operator, motion.run(motionEnv(state, operator)), motion.proceedOnFail === true);
}

function stepNormal(state: VimState, input: KeyInput): Step {
  if (isEscape(input)) return done(state);

  if (state.pending !== null) {
    return hasCommandModifiers(input) ? fail(state) : stepPending(state, state.pending, input);
  }

  if (input.ctrl === true && input.key === "r" && input.alt !== true && input.meta !== true) {
    return redo(state);
  }
  if (hasCommandModifiers(input)) return fail(state);

  const key = input.key;
  const operator = own(OPERATOR_KEYS, key);
  if (operator !== undefined) {
    return { state: { ...state, pending: { kind: "operator", operator } }, accepted: true };
  }

  const lines = state.buffer.lines;
  const { line, column } = state.cursor;
  switch (key) {
    case "i":
      return done(enterInsert(state, state.buffer, state.cursor, { before: state.buffer, cursor: null }), true);
    case "a": {
      const length = lineText(state).length;
      const cursor = { line, column: Math.min(column + 1, length) };
      return done(enterInsert(state, state.buffer, cursor, { before: state.buffer, cursor: null }), true);
    }
    case "o": {
      const buffer = bufferFromLines([...lines.slice(0, line + 1), "", ...lines.slice(line + 1)]);
      const session = { before: state.buffer, cursor: state.cursor };
      return done(enterInsert(state, buffer, { line: line + 1, column: 0 }, session), true);
    }
    case "x":
      // `x` is `dl`.
      return applyMotion(state, "delete", MOVE_RIGHT.run(motionEnv(state, "delete")), true);
    case "p":
      return put(state, false);
    case "P":
      return put(state, true);
    case "u":
      return undo(state);
    default:
      return stepMotionKey(state, null, key);
  }
}

// --- repeat (`.`) --------------------------------------------------------------------------------

/** Inputs as stored for replay: no timestamps or physical codes. */
function replayable(input: KeyInput): KeyInput {
  return {
    key: input.key,
    ...(input.ctrl ? { ctrl: true } : {}),
    ...(input.alt ? { alt: true } : {}),
    ...(input.meta ? { meta: true } : {}),
  };
}

function stepOnce(state: VimState, input: KeyInput): Step {
  return state.mode === "insert" ? stepInsert(state, input) : stepNormal(state, input);
}

/**
 * Replays the last change as one atomic command: if any key is rejected (for
 * example `ci"` where there is no string) nothing changes, like Vim.
 */
function replay(state: VimState): Step {
  const keys = state.repeat.last;
  if (keys === null) return fail(state);

  let current: VimState = { ...state, pending: null, repeat: { ...state.repeat, recording: null } };
  for (const key of keys) {
    const step = stepOnce(current, key);
    if (!step.accepted) return fail(state);
    current = step.state;
  }
  return done({ ...current, repeat: state.repeat });
}

/** Tracks the keys of the command being typed so a finished change can be replayed. */
function track(before: VimState, input: KeyInput, step: Step): VimState {
  const starting = before.mode === "normal" && before.pending === null;
  const recording = before.repeat.recording ?? (starting ? [] : null);
  if (recording === null) return step.state;

  const last = before.repeat.last;
  if (!step.accepted) {
    // A rejected key inside INSERT leaves the session (and its recording) running.
    return before.mode === "insert"
      ? step.state
      : { ...step.state, repeat: { last, recording: null } };
  }

  const keys = [...recording, replayable(input)];
  const next = step.state;
  if (next.mode === "insert" || next.pending !== null) {
    return { ...next, repeat: { last, recording: keys } };
  }
  const repeatable = step.change === true || before.mode === "insert";
  return { ...next, repeat: { last: repeatable ? keys : last, recording: null } };
}

/**
 * Applies one input. Pure: the previous state is never mutated, so the same
 * `(state, input)` always yields the same result and a run can be replayed.
 */
export function dispatch(state: VimState, input: KeyInput): DispatchResult {
  const isDot =
    state.mode === "normal" &&
    state.pending === null &&
    input.key === "." &&
    !hasCommandModifiers(input);
  const step = isDot ? replay(state) : stepOnce(state, input);
  return { state: isDot ? step.state : track(state, input, step), accepted: step.accepted };
}

/** Folds a key sequence over a state. Rejected keys leave the state unchanged (as in `dispatch`). */
export function runKeys(state: VimState, inputs: readonly KeyInput[]): VimState {
  return inputs.reduce((current, input) => dispatch(current, input).state, state);
}
