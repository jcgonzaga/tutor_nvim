import { useEffect, useRef } from "react";
import { promptOf, type ShellState } from "@tutor-nvim/shell-engine";

/**
 * The terminal: what was typed and printed so far, then the line being typed. The cursor is a
 * block at the end of the line (colour is never its only signal: it is a filled cell). The
 * transcript is a live log, so each command's output is announced when it appears.
 */
export function TerminalView({ state }: { readonly state: ShellState }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [state.transcript.length, state.line]);

  return (
    <div
      data-testid="terminal"
      className="max-h-[420px] min-h-[220px] overflow-y-auto px-6 py-5 font-mono text-[20px] leading-8"
    >
      <div role="log" aria-label="Terminal output" aria-live="polite">
        {state.transcript.map((entry, index) => (
          <div key={index}>
            <div className="whitespace-pre-wrap break-all">
              <span className="text-ink-3">{entry.prompt} </span>
              {entry.command}
            </div>
            {entry.output ? (
              <pre
                data-testid="terminal-output"
                className="m-0 whitespace-pre-wrap break-all font-[inherit] text-ink-2"
              >
                {entry.output.replace(/\n$/, "")}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
      <div data-testid="terminal-line" className="whitespace-pre-wrap break-all">
        <span className="text-ink-3">{promptOf(state)} </span>
        {state.line}
        <span aria-hidden className="inline-block h-[26px] w-[1ch] translate-y-1 bg-amber" />
      </div>
      <div ref={end} />
    </div>
  );
}
