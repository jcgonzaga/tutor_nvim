import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { pendingKeys } from "@tutor-nvim/vim-engine";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { shouldPreventDefault, toKeyInput } from "../input/keyboard";
import { EditorView } from "./EditorView";
import { ResultPanel } from "./ResultPanel";
import { usePracticeAttempt } from "./usePracticeAttempt";

interface PracticeScreenProps {
  readonly exercise: Exercise;
  readonly nextSlug: string | null;
}

export function PracticeScreen({ exercise, nextSlug }: PracticeScreenProps) {
  const { attempt, evaluation, hints, sendInput, requestHint, reset } =
    usePracticeAttempt(exercise);
  const editorRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  useEffect(() => {
    // The editor is frozen once solved: hand keyboard focus to the next action.
    if (finished) retryRef.current?.focus();
  }, [finished]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const input = toKeyInput(event.nativeEvent, performance.now());
    if (input === null) return;
    if (shouldPreventDefault(input)) event.preventDefault();
    sendInput(input);
  }

  function handleRetry() {
    reset();
    editorRef.current?.focus();
  }

  function handleHint() {
    requestHint();
    editorRef.current?.focus();
  }

  const { state, events } = attempt;
  const lastEvent = events[events.length - 1];
  const modeLabel = state.mode.toUpperCase();

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-2xl space-y-4">
        <header>
          <p className="text-xs uppercase tracking-widest text-zinc-400">Challenge</p>
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
            <span data-testid="keystroke-count">{events.length} keys</span>
          </div>
        </div>

        {exercise.hints.length > 0 && !finished ? (
          <div className="text-sm">
            <ol data-testid="hints" aria-live="polite" className="space-y-1 text-zinc-300">
              {hints.revealed.map((hint) => (
                <li key={hint.level}>
                  <span className="text-zinc-400">Hint {hint.level}: </span>
                  {hint.text}
                </li>
              ))}
            </ol>
            {hints.next ? (
              <button
                type="button"
                onClick={handleHint}
                disabled={!hintReady}
                className="mt-2 rounded border border-zinc-600 px-3 py-1 text-xs hover:bg-zinc-800 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400 disabled:cursor-not-allowed disabled:text-zinc-500 disabled:hover:bg-transparent"
              >
                {hintReady ? "Show hint" : "Hint available soon"}
              </button>
            ) : null}
          </div>
        ) : null}

        {evaluation ? (
          <ResultPanel
            ref={retryRef}
            evaluation={evaluation}
            onRetry={handleRetry}
            nextHref={nextSlug ? `?exercise=${encodeURIComponent(nextSlug)}` : null}
          />
        ) : null}
      </div>
    </main>
  );
}
