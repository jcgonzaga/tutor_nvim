import type { AttemptEvaluation } from "@tutor-nvim/evaluation";
import type { AntiPatternId } from "@tutor-nvim/exercise-schema";

interface ResultPanelProps {
  readonly evaluation: AttemptEvaluation;
  readonly onRetry: () => void;
  /** Link to the next exercise, when there is one. */
  readonly nextHref: string | null;
}

/** Learner-facing wording for each anti-pattern; the detection itself lives in the evaluation package. */
const ANTI_PATTERN_LABELS: Readonly<Record<AntiPatternId, string>> = {
  repeated_x: "Repeated x: try a motion or operator that deletes more at once",
  excessive_hjkl: "Many h/j/k/l presses: look for a faster motion",
  arrow_keys: "Arrow keys: stay on the home row",
  insert_mode_navigation: "Moving around in INSERT mode: leave it with Esc first",
  repeated_escape: "Esc pressed repeatedly: once is enough",
};

function formatMs(ms: number | null): string {
  return ms === null ? "-" : `${Math.round(ms)} ms`;
}

const buttonClass =
  "rounded border border-zinc-500 px-3 py-1 text-sm hover:bg-zinc-800 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400";

export function ResultPanel({ evaluation, onRetry, nextHref }: ResultPanelProps) {
  const { success, strategy, metrics, antiPatterns } = evaluation;
  const rows: ReadonlyArray<readonly [label: string, testId: string, value: string]> = [
    ["Strategy", "result-strategy", strategy],
    ["Keystrokes", "result-keystrokes", String(metrics.keystrokes)],
    ["First input", "result-first-input", formatMs(metrics.firstInputLatencyMs)],
    ["Duration", "result-duration", formatMs(metrics.totalDurationMs)],
    ["Efficiency", "result-efficiency", `${Math.round(metrics.efficiencyScore)}`],
    ["Performance", "result-performance", `${Math.round(metrics.performanceScore)}`],
    ["Errors", "result-errors", String(metrics.errors)],
    ["Hints used", "result-hints", String(metrics.hintsUsed)],
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
      {antiPatterns.length > 0 ? (
        <ul data-testid="result-anti-patterns" className="mt-3 space-y-1 text-sm">
          {antiPatterns.map((hit) => (
            <li key={hit.id}>
              <span aria-hidden>⚠ </span>
              {ANTI_PATTERN_LABELS[hit.id]}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={onRetry} className={buttonClass}>
          Try again
        </button>
        {nextHref ? (
          <a href={nextHref} className={buttonClass}>
            Next exercise
          </a>
        ) : null}
      </div>
    </section>
  );
}
