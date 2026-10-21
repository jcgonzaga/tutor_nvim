import { forwardRef } from "react";
import type { AttemptEvaluation } from "@tutor-nvim/evaluation";

interface ResultPanelProps {
  readonly evaluation: AttemptEvaluation;
  readonly onRetry: () => void;
}

function formatMs(ms: number | null): string {
  return ms === null ? "-" : `${Math.round(ms)} ms`;
}

export const ResultPanel = forwardRef<HTMLButtonElement, ResultPanelProps>(function ResultPanel(
  { evaluation, onRetry },
  retryRef,
) {
  const { success, strategy, metrics } = evaluation;
  const rows: ReadonlyArray<readonly [label: string, testId: string, value: string]> = [
    ["Strategy", "result-strategy", strategy],
    ["Keystrokes", "result-keystrokes", String(metrics.keystrokes)],
    ["First input", "result-first-input", formatMs(metrics.firstInputLatencyMs)],
    ["Duration", "result-duration", formatMs(metrics.totalDurationMs)],
    ["Efficiency", "result-efficiency", `${Math.round(metrics.efficiencyScore)}`],
  ];

  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="result"
      className="rounded border border-zinc-700 bg-zinc-900 p-4"
    >
      <h2 data-testid="result-outcome" className="text-lg font-semibold tracking-wide">
        {success ? "SUCCESS" : "NOT SOLVED"}
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-sm">
        {rows.map(([label, testId, value]) => (
          <div key={testId} className="contents">
            <dt className="text-zinc-400">{label}</dt>
            <dd data-testid={testId}>{value}</dd>
          </div>
        ))}
      </dl>
      <button
        ref={retryRef}
        type="button"
        onClick={onRetry}
        className="mt-4 rounded border border-zinc-500 px-3 py-1 text-sm hover:bg-zinc-800 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400"
      >
        Try again
      </button>
    </section>
  );
});
