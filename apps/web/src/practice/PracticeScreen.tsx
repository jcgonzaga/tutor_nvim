import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { pendingKeys } from "@tutor-nvim/vim-engine";
import {
  describeFeedback,
  type Attempt,
  type AttemptEvaluation,
  type Feedback,
} from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { shouldPreventDefault, toKeyInput } from "../input/keyboard";
import { EditorView } from "./EditorView";
import { ResultPanel } from "./ResultPanel";
import { usePracticeAttempt } from "./usePracticeAttempt";

/** An attempt that ended, solved or given up. */
export interface FinishedPractice {
  readonly attempt: Attempt;
  readonly evaluation: AttemptEvaluation;
  readonly feedback: Feedback;
}

interface PracticeScreenProps {
  readonly exercise: Exercise;
  /** Small label above the instruction. */
  readonly eyebrow?: string;
  /** Minimal progress for sessions and calibration, e.g. "3 of 12". */
  readonly progress?: string;
  /** Called once when the attempt ends. The parent records it; the screen stays on the result. */
  readonly onFinish?: (finished: FinishedPractice) => void;
  /** Offers a button that ends the attempt as a failure ("Skip", "I don't know"). */
  readonly giveUpLabel?: string;
  /** Replaces the default result panel; `retry` starts the same exercise again. */
  readonly renderResult?: (finished: FinishedPractice, retry: () => void) => ReactNode;
  /** Combo of the session in play; shown next to the mode when it is above zero. */
  readonly combo?: number;
  /** Free practice only: where "Next exercise" leads. */
  readonly nextSlug?: string | null;
}

const secondaryButton =
  "rounded border border-zinc-600 px-3 py-1 text-xs hover:bg-zinc-800 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400 disabled:cursor-not-allowed disabled:text-zinc-500 disabled:hover:bg-transparent";

/**
 * The practice loop for one exercise: instruction, editor, mode and immediate feedback. It is the
 * same screen for free practice, calibration probes and session items; the caller decides what
 * happens at the end (`onFinish`, `renderResult`). Keyboard capture is scoped to the editor.
 */
export function PracticeScreen({
  exercise,
  eyebrow = "Challenge",
  progress,
  onFinish,
  giveUpLabel,
  renderResult,
  combo = 0,
  nextSlug = null,
}: PracticeScreenProps) {
  const { attempt, evaluation, hints, sendInput, requestHint, giveUp, reset } =
    usePracticeAttempt(exercise);
  const editorRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const finished = evaluation !== null;

  // The hint button wakes up when the next hint becomes available. A timer can fire a hair before
  // the clock reaches `nextHintAt`, so the effect depends on `now` and re-arms until it has passed.
  const [now, setNow] = useState(() => performance.now());
  const nextHintAt = hints.next?.availableAt ?? null;
  useEffect(() => {
    if (nextHintAt === null || now >= nextHintAt) return;
    const timer = setTimeout(
      () => setNow(performance.now()),
      Math.max(nextHintAt - performance.now(), 1),
    );
    return () => clearTimeout(timer);
  }, [nextHintAt, now]);
  const hintReady = !finished && nextHintAt !== null && now >= nextHintAt;

  // The editor owns the keyboard on arrival and again after "Try again" (which restarts the clock).
  useEffect(() => {
    editorRef.current?.focus();
  }, [attempt.startedAt]);

  // Reported once per ended attempt. The ref also keeps React's double-invoked dev effects from
  // reporting the same attempt twice, which would count it as two attempts.
  const reported = useRef<Attempt | null>(null);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });
  const feedback = useMemo(
    () => (evaluation ? describeFeedback(exercise, attempt, evaluation) : null),
    [exercise, attempt, evaluation],
  );
  useEffect(() => {
    if (evaluation === null || feedback === null || reported.current === attempt) return;
    reported.current = attempt;
    onFinishRef.current?.({ attempt, evaluation, feedback });
  }, [attempt, evaluation, feedback]);

  useEffect(() => {
    // The editor is frozen once the attempt ended: hand keyboard focus to the next action.
    if (finished) resultRef.current?.querySelector<HTMLElement>("button, a")?.focus();
  }, [finished]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const input = toKeyInput(event.nativeEvent, performance.now());
    if (input === null) return;
    if (shouldPreventDefault(input)) event.preventDefault();
    sendInput(input);
  }

  function handleHint() {
    requestHint();
    editorRef.current?.focus();
  }

  const { state, events } = attempt;
  const lastEvent = events[events.length - 1];
  const modeLabel = state.mode.toUpperCase();
  const finishedPractice: FinishedPractice | null =
    evaluation && feedback ? { attempt, evaluation, feedback } : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-2xl space-y-4">
        <header>
          <div className="flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-400">
            <p>{eyebrow}</p>
            {progress ? <p data-testid="practice-progress">{progress}</p> : null}
          </div>
          <h1 id="instruction" className="mt-1 text-lg">
            {exercise.instruction}
          </h1>
        </header>

        <div
          ref={editorRef}
          role="application"
          aria-label="Vim practice editor"
          aria-describedby="instruction"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="peer rounded border border-zinc-700 bg-zinc-900 p-4 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400"
        >
          <EditorView lines={state.buffer.lines} cursor={state.cursor} mode={state.mode} />
        </div>
        <p className="text-xs text-zinc-400 peer-focus:invisible">
          Click the editor, or press Tab until it is focused, to start typing.
        </p>

        <div className="flex items-center justify-between font-mono text-sm">
          <div className="flex items-center gap-4">
            <span data-testid="vim-mode" className="rounded bg-zinc-800 px-2 py-0.5 font-semibold">
              {modeLabel}
            </span>
            <span
              data-testid="pending-command"
              aria-label="pending command"
              className="text-zinc-300"
            >
              {pendingKeys(state.pending)}
            </span>
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            {lastEvent && !lastEvent.accepted ? (
              <span role="status">{`✕ ${lastEvent.logicalKey} not accepted`}</span>
            ) : null}
            {combo > 0 ? (
              <span data-testid="combo">
                <span aria-hidden>⚡ </span>Combo ×{combo}
              </span>
            ) : null}
            <span data-testid="keystroke-count">{events.length} keys</span>
          </div>
        </div>

        {!finished && (exercise.hints.length > 0 || giveUpLabel) ? (
          <div className="text-sm">
            <ol data-testid="hints" aria-live="polite" className="space-y-1 text-zinc-300">
              {hints.revealed.map((hint) => (
                <li key={hint.level}>
                  <span className="text-zinc-400">Hint {hint.level}: </span>
                  {hint.text}
                </li>
              ))}
            </ol>
            <div className="mt-2 flex gap-3">
              {hints.next ? (
                <button
                  type="button"
                  onClick={handleHint}
                  disabled={!hintReady}
                  className={secondaryButton}
                >
                  {hintReady ? "Show hint" : "Hint available soon"}
                </button>
              ) : null}
              {giveUpLabel ? (
                <button type="button" onClick={giveUp} className={secondaryButton}>
                  {giveUpLabel}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {finishedPractice ? (
          <div ref={resultRef}>
            {renderResult ? (
              renderResult(finishedPractice, reset)
            ) : (
              <ResultPanel
                evaluation={finishedPractice.evaluation}
                onRetry={reset}
                nextHref={nextSlug ? `?exercise=${encodeURIComponent(nextSlug)}` : null}
              />
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
