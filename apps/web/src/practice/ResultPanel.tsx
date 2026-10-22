import type { AttemptEvaluation } from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { useT } from "../i18n/I18nProvider";
import { AttemptExplanation } from "../teaching/AttemptExplanation";

interface ResultPanelProps {
  readonly evaluation: AttemptEvaluation;
  /** The (localized) exercise, to explain a poor attempt. */
  readonly exercise?: Exercise;
  readonly onRetry: () => void;
  /** Link to the next exercise, when there is one. */
  readonly nextHref: string | null;
}

function formatMs(ms: number | null): string {
  return ms === null ? "-" : `${Math.round(ms)} ms`;
}

const buttonClass =
  "inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-base font-semibold text-ink no-underline hover:bg-raised";

export function ResultPanel({ evaluation, exercise, onRetry, nextHref }: ResultPanelProps) {
  const t = useT();
  const labels = t.practice.result;
  const { success, strategy, metrics, antiPatterns } = evaluation;
  const rows: ReadonlyArray<readonly [label: string, testId: string, value: string]> = [
    [labels.strategy, "result-strategy", t.common.strategies[strategy]],
    [labels.keystrokes, "result-keystrokes", String(metrics.keystrokes)],
    [labels.firstInput, "result-first-input", formatMs(metrics.firstInputLatencyMs)],
    [labels.duration, "result-duration", formatMs(metrics.totalDurationMs)],
    [labels.efficiency, "result-efficiency", `${Math.round(metrics.efficiencyScore)}`],
    [labels.performance, "result-performance", `${Math.round(metrics.performanceScore)}`],
    [labels.errors, "result-errors", String(metrics.errors)],
    [labels.hintsUsed, "result-hints", String(metrics.hintsUsed)],
  ];

  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="result"
      className="rounded-2xl border border-line bg-surface p-8"
    >
      <h2 data-testid="result-outcome" className="text-lg font-semibold tracking-wide">
        {success ? labels.success : labels.notSolved}
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-sm">
        {rows.map(([label, testId, value]) => (
          <div key={testId} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd data-testid={testId}>{value}</dd>
          </div>
        ))}
      </dl>
      {antiPatterns.length > 0 ? (
        <ul data-testid="result-anti-patterns" className="mt-3 space-y-1 text-sm">
          {antiPatterns.map((hit) => (
            <li key={hit.id}>
              <span aria-hidden>⚠ </span>
              {labels.antiPatterns[hit.id]}
            </li>
          ))}
        </ul>
      ) : null}
      {exercise ? (
        <div className="mt-4">
          <AttemptExplanation exercise={exercise} evaluation={evaluation} />
        </div>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={onRetry} className={buttonClass}>
          {labels.tryAgain}
        </button>
        {nextHref ? (
          <a href={nextHref} className={buttonClass}>
            {labels.nextExercise}
          </a>
        ) : null}
      </div>
    </section>
  );
}
