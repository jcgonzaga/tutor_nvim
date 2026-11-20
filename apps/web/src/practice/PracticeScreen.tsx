import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { pendingKeys } from "@tutor-nvim/vim-engine";
import { promptOf } from "@tutor-nvim/shell-engine";
import type { Exercise, ShellExercise, VimExercise } from "@tutor-nvim/exercise-schema";
import { useT } from "../i18n/I18nProvider";
import { shouldPreventDefault, toKeyInput } from "../input/keyboard";
import { EditorView } from "./EditorView";
import { LayerRail } from "./LayerRail";
import { TerminalView } from "./TerminalView";
import { ModePill } from "../ui/ModePill";
import { PracticeFrame } from "./PracticeFrame";
import { PracticeHints } from "./PracticeHints";
import { PracticeResult } from "./PracticeResult";
import { WorkspacePractice } from "./WorkspacePractice";
import { usePracticeScreen, type FinishedPractice } from "./usePracticeScreen";

/** An attempt that ended, solved or given up. Declared by the hook both views share (T8). */
export type { FinishedPractice };

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

interface PracticeSessionProps extends Omit<PracticeScreenProps, "exercise"> {
  /** The two views this screen renders: a Vim buffer or a shell terminal. */
  readonly exercise: VimExercise | ShellExercise;
}

/**
 * The practice loop for one exercise: instruction, editor, mode and immediate feedback. It is the
 * same screen for free practice, calibration probes and session items; the caller decides what
 * happens at the end (`onFinish`, `renderResult`). Keyboard capture is scoped to the editor.
 *
 * Which editor an exercise gets is decided once, here: a workspace story is drawn by the panes view
 * (T8) and the two simulators by theirs, and all three share the frame, the hints, the result and the
 * attempt hook (`usePracticeScreen`).
 */
export function PracticeScreen(props: PracticeScreenProps) {
  if (props.exercise.kind === "workspace") {
    const { exercise, ...rest } = props;
    return <WorkspacePractice exercise={exercise} {...rest} />;
  }
  return <PracticeSession {...props} exercise={props.exercise} />;
}

function PracticeSession({
  exercise,
  eyebrow,
  progress,
  onFinish,
  giveUpLabel,
  renderResult,
  onStart,
  onHint,
  combo = 0,
  nextSlug = null,
}: PracticeSessionProps) {
  const t = useT();
  const {
    attempt,
    hints,
    hintReady,
    finished,
    finishedPractice,
    sendInput,
    requestHint,
    giveUp,
    reset,
  } = usePracticeScreen(exercise, { onStart, onFinish });
  const editorRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // The editor owns the keyboard on arrival and again after "Try again" (which restarts the clock).
  useEffect(() => {
    editorRef.current?.focus();
  }, [attempt.startedAt]);

  useEffect(() => {
    // The editor is frozen once the attempt ended: hand keyboard focus to the next action.
    if (finished) resultRef.current?.querySelector<HTMLElement>("button, a")?.focus();
  }, [finished]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const input = toKeyInput(event.nativeEvent, performance.now());
    if (input === null) return;
    if (shouldPreventDefault(input, attempt.kind === "shell" ? "shell" : "vim")) {
      event.preventDefault();
    }
    sendInput(input);
  }

  function handleHint() {
    if (hints.next) onHint?.(hints.next.hint.level);
    requestHint();
    editorRef.current?.focus();
  }

  const { events } = attempt;
  const lastEvent = events[events.length - 1];

  return (
    <PracticeFrame
      eyebrow={eyebrow}
      progress={progress}
      instruction={exercise.instruction}
      rail={<LayerRail exercise={exercise} events={attempt.events} />}
    >
      <div className="group flex flex-col gap-3">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div
            ref={editorRef}
            role="application"
            aria-label={
              attempt.kind === "shell" ? t.practice.terminalLabel : t.practice.editorLabel
            }
            aria-describedby="instruction"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="focus-visible:outline-offset-[-2px]"
          >
            {attempt.kind === "shell" ? (
              <TerminalView state={attempt.state} />
            ) : attempt.kind === "vim" ? (
              <EditorView
                lines={attempt.state.buffer.lines}
                cursor={attempt.state.cursor}
                mode={attempt.state.mode}
                pending={attempt.state.pending !== null}
              />
            ) : null}
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
              ) : attempt.kind === "vim" ? (
                <>
                  <ModePill mode={attempt.state.mode} pending={attempt.state.pending !== null} />
                  <output
                    data-testid="pending-command"
                    aria-label={t.practice.pendingCommand}
                    aria-live="off"
                    className="text-ink"
                  >
                    {pendingKeys(attempt.state.pending)}
                  </output>
                </>
              ) : null}
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
                  {t.practice.notAccepted(lastEvent.logicalKey)}
                </span>
              ) : null}
              {attempt.kind === "vim" ? (
                <span
                  aria-label={t.practice.cursorPosition}
                >{`${attempt.state.cursor.line + 1}:${attempt.state.cursor.column + 1}`}</span>
              ) : null}
              {combo > 0 ? (
                <span data-testid="combo">
                  {t.practice.combo} <strong className="text-ink">×{combo}</strong>
                </span>
              ) : null}
              <span data-testid="keystroke-count">{t.practice.keys(events.length)}</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-ink-3 group-focus-within:invisible">{t.practice.focusHint}</p>
      </div>

      {!finished && (exercise.hints.length > 0 || giveUpLabel) ? (
        <PracticeHints
          revealed={hints.revealed}
          hasNext={hints.next !== null}
          hintReady={hintReady}
          onHint={handleHint}
          giveUpLabel={giveUpLabel}
          onGiveUp={giveUp}
        />
      ) : null}

      {finishedPractice ? (
        <PracticeResult
          finished={finishedPractice}
          exercise={exercise}
          onRetry={reset}
          nextSlug={nextSlug}
          renderResult={renderResult}
          resultRef={resultRef}
        />
      ) : null}
    </PracticeFrame>
  );
}
