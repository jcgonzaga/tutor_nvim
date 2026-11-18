import { bufferToText } from "@tutor-nvim/vim-engine";
import type { WorkspaceDispatchResult, WorkspaceState } from "./types";
import { openBuffer, withEditor } from "./workspace";
import { withActiveBuffer } from "./windows";

/*
 * The command line of T1: `:e <path>`, `:w`, `:bn`, `:bp` and `:ls`.
 *
 * The recognized forms are exactly those five; anything else is rejected with the reason kept in
 * `lastCommand` for the UI, never a silent no-op. Rejections use Vim's own messages so the learner
 * sees the same text the real editor would print.
 *
 * Paths are the keys of the simulated disk, matched verbatim: T1 resolves nothing against `cwd` and
 * normalizes no path (`./a.ts` and `a.ts` are two files), and a path cannot contain whitespace
 * because the line is split on it.
 *
 * A command that changes which buffer is active changes it the way focus does (T2): the focused
 * window shows it, because focus and the active buffer are one fact, not two.
 */

const notAnEditorCommand = (line: string): string => `E492: Not an editor command: ${line}`;

export function runCommandLine(state: WorkspaceState, line: string): WorkspaceDispatchResult {
  const trimmed = line.trim();
  // An empty command line is Enter on `:` alone: it closes and records nothing.
  if (trimmed === "") return { state, accepted: true };

  const accepted = (
    next: WorkspaceState,
    output: readonly string[] = [],
  ): WorkspaceDispatchResult => ({
    state: { ...next, lastCommand: { command: trimmed, accepted: true, output } },
    accepted: true,
  });
  const rejected = (reason: string): WorkspaceDispatchResult => ({
    state: { ...state, lastCommand: { command: trimmed, accepted: false, output: [], reason } },
    accepted: false,
  });
  const active = state.buffers.find((buffer) => buffer.id === state.activeBufferId);
  const noActiveBuffer = (): WorkspaceDispatchResult => rejected("E32: No file name");

  const [name = "", ...args] = trimmed.split(/\s+/);
  switch (name) {
    case "e": {
      const [path, ...extra] = args;
      if (path === undefined) return rejected("E32: No file name");
      if (extra.length > 0) return rejected(notAnEditorCommand(trimmed));
      const existing = state.buffers.find((buffer) => buffer.path === path);
      if (existing !== undefined) return accepted(withActiveBuffer(state, existing.id));
      // `:e` on a file that is not on the simulated disk is refused rather than faked.
      if (state.files[path] === undefined) return rejected(`E484: Can't open file ${path}`);
      const buffer = openBuffer(state.files, path);
      return accepted(
        withActiveBuffer({ ...state, buffers: [...state.buffers, buffer] }, buffer.id),
      );
    }
    case "w": {
      if (args.length > 0) return rejected(notAnEditorCommand(trimmed));
      if (active === undefined) return noActiveBuffer();
      const files = { ...state.files, [active.path]: bufferToText(active.editor.buffer) };
      const written = withEditor(files, active, active.editor);
      return accepted({
        ...state,
        files,
        buffers: state.buffers.map((buffer) => (buffer.id === active.id ? written : buffer)),
      });
    }
    case "bn":
    case "bp": {
      if (args.length > 0) return rejected(notAnEditorCommand(trimmed));
      if (active === undefined) return noActiveBuffer();
      const count = state.buffers.length;
      const current = state.buffers.findIndex((buffer) => buffer.id === active.id);
      const offset = name === "bn" ? 1 : -1;
      // Wrap around: `:bn` on the last buffer goes to the first one, `:bp` the other way.
      const target = state.buffers[(((current + offset) % count) + count) % count];
      if (target === undefined) return noActiveBuffer();
      return accepted(withActiveBuffer(state, target.id));
    }
    case "ls": {
      if (args.length > 0) return rejected(notAnEditorCommand(trimmed));
      // `<index><% active><+ modified> <path>`, e.g. `2%+ src/lib/format.ts`.
      const output = state.buffers.map((buffer, index) => {
        const marker = buffer.id === state.activeBufferId ? "%" : " ";
        return `${index + 1}${marker}${buffer.modified ? "+" : " "} ${buffer.path}`;
      });
      return accepted(state, output);
    }
    default:
      return rejected(notAnEditorCommand(trimmed));
  }
}
