import { cycleBuffer, openFile, saveActiveFile, type FileStepResult } from "./files";
import type { WorkspaceDispatchResult, WorkspaceState } from "./types";

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
 *
 * The state change itself is never this module's: `:e`, `:w`, `:bn` and `:bp` call the same
 * functions the `file.*` and `buffer.*` actions call (T4b), so a typed command and an action cannot
 * reach two different workspaces. What is here is the parsing and the record of the line typed.
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
  /** A shared file or buffer step, in the command line's own terms: ran, or refused with its reason. */
  const ran = (step: FileStepResult): WorkspaceDispatchResult =>
    step.reason === undefined ? accepted(step.state) : rejected(step.reason);

  const [name = "", ...args] = trimmed.split(/\s+/);
  switch (name) {
    case "e": {
      const [path, ...extra] = args;
      if (path === undefined) return rejected("E32: No file name");
      if (extra.length > 0) return rejected(notAnEditorCommand(trimmed));
      return ran(openFile(state, path));
    }
    case "w": {
      if (args.length > 0) return rejected(notAnEditorCommand(trimmed));
      return ran(saveActiveFile(state));
    }
    case "bn":
    case "bp": {
      if (args.length > 0) return rejected(notAnEditorCommand(trimmed));
      // Wrap around: `:bn` on the last buffer goes to the first one, `:bp` the other way.
      return ran(cycleBuffer(state, name === "bn" ? 1 : -1));
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
