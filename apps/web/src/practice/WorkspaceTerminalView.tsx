import { useT } from "../i18n/I18nProvider";
import type { WorkspaceTerminal } from "./workspaceEngine";

/**
 * A workspace terminal (T7a1, T7a3): its scrollback, then the line being typed at its prompt.
 *
 * It is a second view and not `TerminalView`, because a workspace terminal is a different shape: a
 * `shell-engine` transcript is one process's log with a prompt string, while a workspace session
 * holds `entries` of `{ command, output }` and its own `pending` line. Keeping them apart is honest;
 * adapting one into the other would fake the difference away.
 *
 * No colour-only signal: the prompt is a real cursor block plus the caret's position at the end of
 * the text, and every command is prefixed by its directory, not by a colour.
 */
export function WorkspaceTerminalView({ terminal }: { readonly terminal: WorkspaceTerminal }) {
  const t = useT();
  return (
    <div
      data-testid="workspace-terminal"
      className="min-h-[180px] px-4 py-3 font-mono text-[18px] leading-7"
    >
      <div role="log" aria-label={t.practice.workspace.scrollback} className="flex flex-col">
        {terminal.entries.map((entry, index) => (
          <div key={index}>
            <div className="whitespace-pre-wrap break-all">
              <span className="text-ink-3">{terminal.cwd} $ </span>
              {entry.command}
            </div>
            {entry.output.length > 0 ? (
              <pre
                data-testid="workspace-terminal-output"
                className="m-0 whitespace-pre-wrap break-all font-[inherit] text-ink-2"
              >
                {entry.output.join("\n")}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
      <div className="whitespace-pre-wrap break-all">
        <span className="text-ink-3">{terminal.cwd} $ </span>
        <span data-testid="workspace-terminal-prompt">{terminal.pending}</span>
        <span aria-hidden className="ml-px inline-block h-[22px] w-[1ch] translate-y-1 bg-amber" />
      </div>
    </div>
  );
}
