import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { pendingKeys } from "@tutor-nvim/vim-engine";
import { promptOf } from "@tutor-nvim/shell-engine";
import {
  describeFeedback,
  type Attempt,
  type AttemptEvaluation,
  type Feedback,
} from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { shouldPreventDefault, toKeyInput } from "../input/keyboard";
import { EditorView } from "./EditorView";
import { TerminalView } from "./TerminalView";
import { ModePill } from "../ui/ModePill";
import { quietButton } from "../ui/styles";
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
  /** Called once when the exercise appears on screen. */
  readonly onStart?: () => void;
  /** Called with the level of a hint when the learner asks for it. */
  readonly onHint?: (level: number) => void;
  /** Combo of the session in play; shown next to the mode when it is above zero. */
  readonly combo?: number;
  /** Free practice only: where "Next exercise" leads. */
  readonly nextSlug?: string | null;
}

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
  onStart,
  onHint,
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

  // Told once per exercise shown. The ref keeps React's double-invoked dev effects from telling twice.
  const started = useRef(false);
  const onStartRef = useRef(onStart);
  useEffect(() => {
    onStartRef.current = onStart;
  });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    onStartRef.current?.();
  }, []);

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
    if (shouldPreventDefault(input, attempt.kind)) event.preventDefault();
    sendInput(input);
  }

  function handleHint() {
    if (hints.next) onHint?.(hints.next.hint.level);
    requestHint();
    editorRef.current?.focus();
  }

  const { events } = attempt;
  const lastEvent = events[events.length - 1];
  const finishedPractice: FinishedPractice | null =
    evaluation && feedback ? { attempt, evaluation, feedback } : null;
  // "3 of 12" draws a thin bar next to the text; any other wording is shown as it is.
  const counted = progress ? /^(\d+) of (\d+)$/.exec(progress) : null;
  const fraction = counted
    ? Math.min(1, Number(counted[1]) / Math.max(1, Number(counted[2])))
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-8 py-4">
        <a
          href="#/"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-[15px] font-semibold text-ink-2 no-underline hover:text-ink"
        >
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
          Exit
        </a>
        {progress ? (
          <div className="flex items-center gap-3 text-sm text-ink-2">
            <span data-testid="practice-progress">{progress}</span>
            {fraction !== null ? (
              <span aria-hidden className="h-1 w-[120px] overflow-hidden rounded-sm bg-line">
                <span className="block h-full bg-amber" style={{ width: `${fraction * 100}%` }} />
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col gap-7 px-8 pb-12 pt-8">
        <header className="flex flex-col gap-3.5">
          <p className="text-[15px] font-bold tracking-[0.04em] text-amber">{eyebrow}</p>
          <h1 id="instruction" className="text-balance text-[32px] font-bold leading-tight">
            {exercise.instruction}
          </h1>
        </header>

        <div className="group flex flex-col gap-3">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div
              ref={editorRef}
              role="application"
              aria-label={
                attempt.kind === "shell" ? "Terminal practice area" : "Vim practice editor"
              }
              aria-describedby="instruction"
              tabIndex={0}
              onKeyDown={handleKeyDown}
              className="focus-visible:outline-offset-[-2px]"
            >
              {attempt.kind === "shell" ? (
                <TerminalView state={attempt.state} />
              ) : (
                <EditorView
                  lines={attempt.state.buffer.lines}
                  cursor={attempt.state.cursor}
                  mode={attempt.state.mode}
                  pending={attempt.state.pending !== null}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line bg-sunken px-4 py-2.5 font-mono text-sm">
              <div className="flex items-center gap-3.5">
                {attempt.kind === "shell" ? (
                  <>
                    <span
                      data-testid="shell-mode"
                      className="rounded-md border border-line-strong px-2.5 py-1 text-sm font-bold tracking-[0.04em] text-ink-2"
                    >
                      TERMINAL
                    </span>
                    <span className="text-ink-3">{promptOf(attempt.state)}</span>
                  </>
                ) : (
                  <>
                    <ModePill mode={attempt.state.mode} pending={attempt.state.pending !== null} />
                    <output
                      data-testid="pending-command"
                      aria-label="pending command"
                      aria-live="off"
                      className="text-ink"
                    >
                      {pendingKeys(attempt.state.pending)}
                    </output>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-ink-2">
                {lastEvent && !lastEvent.accepted ? (
                  <span role="status" className="flex items-center gap-1.5 text-ember-ink">
                    <svg
                      aria-hidden
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    >
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                    {`${lastEvent.logicalKey} not accepted`}
                  </span>
                ) : null}
                {attempt.kind === "vim" ? (
                  <span aria-label="cursor position">{`${attempt.state.cursor.line + 1}:${attempt.state.cursor.column + 1}`}</span>
                ) : null}
                {combo > 0 ? (
                  <span data-testid="combo">
                    Combo <strong className="text-ink">×{combo}</strong>
                  </span>
                ) : null}
                <span data-testid="keystroke-count">{events.length} keys</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-ink-3 group-focus-within:invisible">
            Click the editor, or press Tab until it is focused, to start typing.
          </p>
        </div>

        {!finished && (exercise.hints.length > 0 || giveUpLabel) ? (
          <div className="flex flex-col gap-3">
            <ol
              data-testid="hints"
              aria-live="polite"
              className="flex flex-col gap-2 text-[17px] text-ink-2"
            >
              {hints.revealed.map((hint) => (
                <li key={hint.level} className="flex items-center gap-3">
                  <svg
                    aria-hidden
                    width="22"
                    height="22"
                    viewBox="0 0 22 22"
                    fill="none"
                    className="flex-none"
                  >
                    <circle cx="11" cy="11" r="9.5" stroke="#848c96" strokeWidth="1.6" />
                    <path
                      d="M8.6 8.6a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.2"
                      stroke="#b0b7c0"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <circle cx="11" cy="15.8" r="1.1" fill="#b0b7c0" />
                  </svg>
                  <span>
                    <span className="text-ink-3">Hint {hint.level}: </span>
                    {hint.text}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-3">
              {hints.next ? (
                <button
                  type="button"
                  onClick={handleHint}
                  disabled={!hintReady}
                  className={quietButton}
                >
                  {hintReady ? "Show hint" : "Hint available soon"}
                </button>
              ) : null}
              {giveUpLabel ? (
                <button type="button" onClick={giveUp} className={quietButton}>
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
      </main>
    </div>
  );
}
