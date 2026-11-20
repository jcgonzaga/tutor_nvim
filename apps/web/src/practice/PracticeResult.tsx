import type { ReactNode, RefObject } from "react";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { ResultPanel } from "./ResultPanel";
import type { FinishedPractice } from "./usePracticeScreen";

interface PracticeResultProps {
  readonly finished: FinishedPractice;
  readonly exercise: Exercise;
  readonly onRetry: () => void;
  /** Link to the next exercise, when there is one. */
  readonly nextSlug: string | null;
  /** Replaces the default panel; a caller can show its own result and keep the same plumbing. */
  readonly renderResult?:
    ((finished: FinishedPractice, retry: () => void) => ReactNode) | undefined;
  /** Focused when the attempt ends, so a keyboard-only learner lands on the next action. */
  readonly resultRef?: RefObject<HTMLDivElement | null> | undefined;
}

/** The result of an ended attempt, in one place for every kind of exercise (T8). */
export function PracticeResult({
  finished,
  exercise,
  onRetry,
  nextSlug,
  renderResult,
  resultRef,
}: PracticeResultProps) {
  return (
    <div ref={resultRef}>
      {renderResult ? (
        renderResult(finished, onRetry)
      ) : (
        <ResultPanel
          evaluation={finished.evaluation}
          exercise={exercise}
          onRetry={onRetry}
          nextHref={nextSlug ? `?exercise=${encodeURIComponent(nextSlug)}` : null}
        />
      )}
    </div>
  );
}
