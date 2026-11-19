import { dispatch, type VimState } from "@tutor-nvim/vim-engine";
import type { FileStepResult } from "./files";
import type { WorkspaceState } from "./types";
import { withEditor } from "./workspace";

/*
 * Typing is the one thing a workspace action can change about the text (L9, S1).
 *
 * The engine still edits nothing itself: `i` enters INSERT at the cursor, the characters are fed one
 * key at a time (Enter for a newline) and Esc leaves INSERT, so the end state is NORMAL and the text
 * is exactly what `vim-engine` produces for those keys. Writing the buffer here would be a second
 * answer to "what does typing do", and the story could only be wrong.
 *
 * No clock, no I/O: the same state and the same text give the same buffer, and `:w` is still what
 * puts it on the simulated disk.
 */

/** The keys a person presses around the text, as the editor takes them. */
const START_INSERT = { key: "i" } as const;
const LEAVE_INSERT = { key: "Escape" } as const;

/** A character of the text as the key that types it: a newline is Enter, everything else itself. */
const keyFor = (character: string) => ({ key: character === "\n" ? "Enter" : character });

/**
 * Presses `i`, types the text and leaves INSERT, all through `vim-engine`'s `dispatch`. An editor
 * already in INSERT mode keeps typing where it is instead of opening a second insert session.
 */
function typeThrough(editor: VimState, text: string): VimState {
  let current = editor.mode === "insert" ? editor : dispatch(editor, START_INSERT).state;
  for (const character of text) {
    current = dispatch(current, keyFor(character)).state;
  }
  return dispatch(current, LEAVE_INSERT).state;
}

/**
 * Types `text` into the active buffer at the cursor and leaves the editor in NORMAL mode. An empty
 * text is refused: an insert that types nothing is not a step a story can ask for.
 */
export function typeText(state: WorkspaceState, text: string): FileStepResult {
  if (text === "") return { state, reason: "edit.insert: the text to type is empty" };
  const active = state.buffers.find((buffer) => buffer.id === state.activeBufferId);
  if (active === undefined) return { state, reason: "E32: No file name" };
  const editor = typeThrough(active.editor, text);
  return {
    state: {
      ...state,
      // `modified` follows the text, so undoing the typing back to the file clears it again.
      buffers: state.buffers.map((buffer) =>
        buffer.id === active.id ? withEditor(state.files, buffer, editor) : buffer,
      ),
    },
  };
}
