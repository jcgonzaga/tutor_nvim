import { bufferToText, type KeyInput } from "@tutor-nvim/vim-engine";
import { describe, expect, it } from "vitest";
import {
  activeBuffer,
  bufferByPath,
  bufferId,
  createWorkspace,
  dispatchWorkspace,
  isBufferModified,
  lastCommandResult,
  openBufferPaths,
  runWorkspaceKeys,
  type WorkspaceState,
} from "./index";

/**
 * Oracle tests: every supported command is replayed as a recorded key sequence and the *whole*
 * resulting state is asserted (files, buffers and their order, active buffer, each buffer's text,
 * cursor and modified flag, the pending command, the last command result). A command that only
 * looks right in one field is not enough.
 */

const MAIN_TEXT = 'const mode = "development";';
const FORMAT_TEXT = "export const format = (value: number) => String(value);";
const README_TEXT = "# workspace";

const FILES: Readonly<Record<string, string>> = {
  "src/main.ts": MAIN_TEXT,
  "src/lib/format.ts": FORMAT_TEXT,
  "README.md": README_TEXT,
};
const CWD = "/home/user/project";
const START = "src/main.ts";
const INIT = { files: FILES, path: START, cwd: CWD };

interface BufferSnapshot {
  readonly id: string;
  readonly path: string;
  readonly lines: readonly string[];
  readonly text: string;
  readonly cursor: { readonly line: number; readonly column: number };
  readonly mode: string;
  readonly modified: boolean;
}

interface Snapshot {
  readonly files: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly buffers: readonly BufferSnapshot[];
  readonly activeBufferId: string;
  readonly pending: unknown;
  readonly lastCommand: unknown;
}

const snapshot = (state: WorkspaceState): Snapshot => ({
  files: { ...state.files },
  cwd: state.cwd,
  buffers: state.buffers.map((buffer) => ({
    id: buffer.id,
    path: buffer.path,
    lines: buffer.editor.buffer.lines,
    text: bufferToText(buffer.editor.buffer),
    cursor: buffer.editor.cursor,
    mode: buffer.editor.mode,
    modified: buffer.modified,
  })),
  activeBufferId: state.activeBufferId,
  pending: state.pending,
  lastCommand: state.lastCommand,
});

/** Expected buffer for a single-line file, which is what every fixture file is. */
const bufferState = (
  path: string,
  text: string,
  cursor: { line: number; column: number } = { line: 0, column: 0 },
  modified = false,
): BufferSnapshot => ({
  id: bufferId(path),
  path,
  lines: [text],
  text,
  cursor,
  mode: "normal",
  modified,
});

const key = (pressed: string): KeyInput => ({ key: pressed });
const keysOf = (text: string): KeyInput[] => [...text].map(key);
const type = (state: WorkspaceState, text: string): WorkspaceState =>
  runWorkspaceKeys(state, keysOf(text));

/** Types `:command` and presses Enter, keeping the last key's result. */
function typeCommand(
  state: WorkspaceState,
  command: string,
): { state: WorkspaceState; accepted: boolean } {
  const typed = type(state, `:${command}`);
  return dispatchWorkspace(typed, key("Enter"));
}

const initial = (): WorkspaceState => createWorkspace(INIT);

describe("createWorkspace", () => {
  it("opens the starting file in one buffer", () => {
    expect(snapshot(initial())).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [bufferState(START, MAIN_TEXT)],
      activeBufferId: bufferId(START),
      pending: null,
      lastCommand: null,
    });
  });
});

describe(":e — open a file", () => {
  it("opens a file that is not open yet and focuses it", () => {
    const { state, accepted } = typeCommand(initial(), "e src/lib/format.ts");
    expect(accepted).toBe(true);
    expect(snapshot(state)).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [bufferState(START, MAIN_TEXT), bufferState("src/lib/format.ts", FORMAT_TEXT)],
      activeBufferId: bufferId("src/lib/format.ts"),
      pending: null,
      lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
    });
  });

  it("focuses an open buffer instead of opening it twice", () => {
    const opened = typeCommand(initial(), "e src/lib/format.ts").state;
    const { state, accepted } = typeCommand(opened, "e src/main.ts");
    expect(accepted).toBe(true);
    expect(snapshot(state)).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [bufferState(START, MAIN_TEXT), bufferState("src/lib/format.ts", FORMAT_TEXT)],
      activeBufferId: bufferId(START),
      pending: null,
      lastCommand: { command: "e src/main.ts", accepted: true, output: [] },
    });
  });

  it("rejects a path that is not on the simulated disk and changes nothing else", () => {
    const before = initial();
    const { state, accepted } = typeCommand(before, "e missing.ts");
    expect(accepted).toBe(false);
    expect(state.files).toBe(before.files);
    expect(state.buffers).toBe(before.buffers);
    expect(state.activeBufferId).toBe(before.activeBufferId);
    expect(state.pending).toBeNull();
    expect(state.lastCommand).toEqual({
      command: "e missing.ts",
      accepted: false,
      output: [],
      reason: "E484: Can't open file missing.ts",
    });
  });

  it("rejects :e without a path", () => {
    const before = initial();
    const { state, accepted } = typeCommand(before, "e");
    expect(accepted).toBe(false);
    expect(state.files).toBe(before.files);
    expect(state.buffers).toBe(before.buffers);
    expect(state.lastCommand).toEqual({
      command: "e",
      accepted: false,
      output: [],
      reason: "E32: No file name",
    });
  });
});

describe(":w — save the active buffer", () => {
  it("writes the edited text into files and clears modified", () => {
    const edited = type(initial(), "x");
    expect(snapshot(edited).buffers[0]?.modified).toBe(true);

    const { state, accepted } = typeCommand(edited, "w");
    expect(accepted).toBe(true);
    const SAVED_TEXT = 'onst mode = "development";';
    expect(snapshot(state)).toEqual({
      files: { ...FILES, "src/main.ts": SAVED_TEXT },
      cwd: CWD,
      buffers: [bufferState(START, SAVED_TEXT)],
      activeBufferId: bufferId(START),
      pending: null,
      lastCommand: { command: "w", accepted: true, output: [] },
    });
  });

  it("saves the buffer that is active, not the first one", () => {
    const opened = typeCommand(initial(), "e src/lib/format.ts").state;
    const edited = type(opened, "x");
    const { state } = typeCommand(edited, "w");
    expect(snapshot(state)).toEqual({
      files: {
        ...FILES,
        "src/lib/format.ts": "xport const format = (value: number) => String(value);",
      },
      cwd: CWD,
      buffers: [
        bufferState(START, MAIN_TEXT),
        bufferState("src/lib/format.ts", "xport const format = (value: number) => String(value);"),
      ],
      activeBufferId: bufferId("src/lib/format.ts"),
      pending: null,
      lastCommand: { command: "w", accepted: true, output: [] },
    });
  });
});

describe(":bn and :bp — switch buffers", () => {
  const threeOpen = (): WorkspaceState => {
    const withFormat = typeCommand(initial(), "e src/lib/format.ts").state;
    return typeCommand(withFormat, "e README.md").state;
  };

  it("opens three buffers in the order they were opened, the last one active", () => {
    expect(snapshot(threeOpen())).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [
        bufferState(START, MAIN_TEXT),
        bufferState("src/lib/format.ts", FORMAT_TEXT),
        bufferState("README.md", README_TEXT),
      ],
      activeBufferId: bufferId("README.md"),
      pending: null,
      lastCommand: { command: "e README.md", accepted: true, output: [] },
    });
  });

  it(":bn wraps around from the last buffer to the first", () => {
    const { state, accepted } = typeCommand(threeOpen(), "bn");
    expect(accepted).toBe(true);
    expect(snapshot(state)).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [
        bufferState(START, MAIN_TEXT),
        bufferState("src/lib/format.ts", FORMAT_TEXT),
        bufferState("README.md", README_TEXT),
      ],
      activeBufferId: bufferId(START),
      pending: null,
      lastCommand: { command: "bn", accepted: true, output: [] },
    });
  });

  it(":bp wraps around from the first buffer to the last", () => {
    const { state, accepted } = typeCommand(threeOpen(), "bn");
    expect(accepted).toBe(true);
    expect(snapshot(state).activeBufferId).toBe(bufferId(START));
    const previous = typeCommand(state, "bp");
    expect(previous.accepted).toBe(true);
    expect(snapshot(previous.state)).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [
        bufferState(START, MAIN_TEXT),
        bufferState("src/lib/format.ts", FORMAT_TEXT),
        bufferState("README.md", README_TEXT),
      ],
      activeBufferId: bufferId("README.md"),
      pending: null,
      lastCommand: { command: "bp", accepted: true, output: [] },
    });
  });
});

describe(":ls — list buffers", () => {
  it("lists every buffer in opening order with the active and modified markers", () => {
    const three = typeCommand(
      typeCommand(initial(), "e src/lib/format.ts").state,
      "e README.md",
    ).state;
    const format = typeCommand(three, "bp").state;
    const edited = type(format, "x");
    const { state, accepted } = typeCommand(edited, "ls");
    expect(accepted).toBe(true);
    expect(snapshot(state)).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [
        bufferState(START, MAIN_TEXT),
        bufferState(
          "src/lib/format.ts",
          "xport const format = (value: number) => String(value);",
          { line: 0, column: 0 },
          true,
        ),
        bufferState("README.md", README_TEXT),
      ],
      activeBufferId: bufferId("src/lib/format.ts"),
      pending: null,
      lastCommand: {
        command: "ls",
        accepted: true,
        output: ["1   src/main.ts", "2%+ src/lib/format.ts", "3   README.md"],
      },
    });
  });
});

describe("the command line", () => {
  it("opens on : and keeps the key away from the editor", () => {
    const before = initial();
    const { state, accepted } = dispatchWorkspace(before, key(":"));
    expect(accepted).toBe(true);
    expect(snapshot(state)).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [bufferState(START, MAIN_TEXT)],
      activeBufferId: bufferId(START),
      pending: { kind: "command-line", text: "" },
      lastCommand: null,
    });
    expect(state.buffers[0]?.editor).toBe(before.buffers[0]?.editor);
  });

  it("appends printable keys and removes them with Backspace", () => {
    const typed = type(initial(), ":e src/ma");
    expect(typed.pending).toEqual({ kind: "command-line", text: "e src/ma" });
    const back = runWorkspaceKeys(typed, [key("Backspace"), key("Backspace")]);
    expect(back.pending).toEqual({ kind: "command-line", text: "e src/" });
    expect(back.buffers).toBe(typed.buffers);
  });

  it("cancels on Esc and lets the next key reach the editor", () => {
    const typed = type(initial(), ":e README.md");
    const cancelled = dispatchWorkspace(typed, key("Escape"));
    expect(cancelled.accepted).toBe(true);
    expect(cancelled.state.pending).toBeNull();
    expect(cancelled.state.buffers).toBe(typed.buffers);
    expect(cancelled.state.lastCommand).toBeNull();

    const edited = dispatchWorkspace(cancelled.state, key("x"));
    expect(edited.accepted).toBe(true);
    expect(snapshot(edited.state).buffers).toEqual([
      bufferState(START, 'onst mode = "development";', { line: 0, column: 0 }, true),
    ]);
    expect(snapshot(edited.state).activeBufferId).toBe(bufferId(START));
  });

  it("cancels on Enter when the line is empty", () => {
    const { state, accepted } = typeCommand(initial(), "");
    expect(accepted).toBe(true);
    expect(state).toEqual(initial());
  });

  it("rejects an unknown command with the reason kept for the UI", () => {
    const before = initial();
    const { state, accepted } = typeCommand(before, "foo");
    expect(accepted).toBe(false);
    expect(state.files).toBe(before.files);
    expect(state.buffers).toBe(before.buffers);
    expect(state.pending).toBeNull();
    expect(state.lastCommand).toEqual({
      command: "foo",
      accepted: false,
      output: [],
      reason: "E492: Not an editor command: foo",
    });
  });

  it("treats : as text in INSERT mode", () => {
    const inserted = type(initial(), "i:5");
    expect(inserted.pending).toBeNull();
    expect(snapshot(inserted)).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [
        {
          ...bufferState(START, ':5const mode = "development";', { line: 0, column: 2 }, true),
          mode: "insert",
        },
      ],
      activeBufferId: bufferId(START),
      pending: null,
      lastCommand: null,
    });
    const left = dispatchWorkspace(inserted, key("Escape"));
    expect(left.accepted).toBe(true);
    expect(snapshot(left.state)).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [bufferState(START, ':5const mode = "development";', { line: 0, column: 1 }, true)],
      activeBufferId: bufferId(START),
      pending: null,
      lastCommand: null,
    });
  });
});

describe("editing stays inside the active buffer", () => {
  it("edits the buffer that is active and leaves the others untouched", () => {
    const opened = typeCommand(initial(), "e src/lib/format.ts").state;
    expect(dispatchWorkspace(opened, key("x")).accepted).toBe(true);
    const { state } = dispatchWorkspace(opened, key("x"));
    expect(snapshot(state)).toEqual({
      files: FILES,
      cwd: CWD,
      buffers: [
        bufferState(START, MAIN_TEXT),
        bufferState(
          "src/lib/format.ts",
          "xport const format = (value: number) => String(value);",
          { line: 0, column: 0 },
          true,
        ),
      ],
      activeBufferId: bufferId("src/lib/format.ts"),
      pending: null,
      lastCommand: { command: "e src/lib/format.ts", accepted: true, output: [] },
    });
  });
});

describe("determinism", () => {
  it("gives the same whole state for the same recorded sequence", () => {
    const sequence: KeyInput[] = [
      ...keysOf(":e src/lib/format.ts"),
      key("Enter"),
      key("x"),
      ...keysOf(":bn"),
      key("Enter"),
    ];
    const first = runWorkspaceKeys(initial(), sequence);
    const second = runWorkspaceKeys(initial(), sequence);
    expect(snapshot(first)).toEqual(snapshot(second));
    // Undo stacks, registers and the repeat state are part of the state too.
    expect(first).toEqual(second);
    expect(snapshot(first).buffers).toEqual([
      bufferState(START, MAIN_TEXT),
      bufferState(
        "src/lib/format.ts",
        "xport const format = (value: number) => String(value);",
        { line: 0, column: 0 },
        true,
      ),
    ]);
    expect(snapshot(first).activeBufferId).toBe(bufferId(START));
  });
});

describe("selectors", () => {
  it("expose the active buffer, a buffer by path, modified flags and the open paths", () => {
    const state = typeCommand(initial(), "e src/lib/format.ts").state;
    expect(activeBuffer(state).id).toBe(bufferId("src/lib/format.ts"));
    expect(bufferByPath(state, START)?.id).toBe(bufferId(START));
    expect(bufferByPath(state, "README.md")).toBeUndefined();
    expect(openBufferPaths(state)).toEqual([START, "src/lib/format.ts"]);
    expect(isBufferModified(state, bufferId(START))).toBe(false);
    const edited = type(state, "x");
    expect(isBufferModified(edited, activeBuffer(edited).id)).toBe(true);
    expect(isBufferModified(edited, bufferId(START))).toBe(false);
    expect(isBufferModified(edited, "buf:README.md")).toBe(false);
    expect(lastCommandResult(state)).toEqual({
      command: "e src/lib/format.ts",
      accepted: true,
      output: [],
    });
  });
});

describe("rejected keys", () => {
  it("leaves the state identical when the command line does not consume the key", () => {
    const typed = type(initial(), ":e");
    const { state, accepted } = dispatchWorkspace(typed, key("ArrowLeft"));
    expect(accepted).toBe(false);
    expect(state).toBe(typed);
  });

  it("leaves the state identical when the editor does not consume the key", () => {
    const before = initial();
    const { state, accepted } = dispatchWorkspace(before, key("F1"));
    expect(accepted).toBe(false);
    expect(state).toEqual(before);
  });
});
