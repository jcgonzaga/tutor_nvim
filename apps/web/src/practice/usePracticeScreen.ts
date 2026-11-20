import { useEffect, useMemo, useRef, useState } from "react";
import {
  describeFeedback,
  type Attempt,
  type AttemptEvaluation,
  type Feedback,
} from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { usePracticeAttempt } from "./usePracticeAttempt";

/** An attempt that ended, solved or given up. */
export interface FinishedPractice {
  readonly attempt: Attempt;
  readonly evaluation: AttemptEvaluation;
  readonly feedback: Feedback;
}

interface PracticeScreenOptions {
  /** Called once when the exercise appears on screen. */
  readonly onStart?: (() => void) | undefined;
  /** Called once when the attempt ends. The parent records it; the screen stays on the result. */
  readonly onFinish?: ((finished: FinishedPractice) => void) | undefined;
}

/**
 * Everything a practice screen does around the attempt, independent of what it draws (T8).
 *
 * The vim, shell and workspace views differ only in their editor; the clock, the hint button, the
 * "reported once" rules and the feedback are the same, so they live here instead of being copied
 * into a second screen. The attempt itself stays in `usePracticeAttempt`, which stays a binding over
 * `@tutor-nvim/evaluation` (AGENTS.md 2.4): nothing here decides what a key means or what a goal is.
 */
export function usePracticeScreen(
  exercise: Exercise,
  { onStart, onFinish }: PracticeScreenOptions,
) {
  const {
    attempt,
    evaluation,
    hints,
    refusal,
    sendInput,
    sendWorkspaceKey,
    sendWorkspaceAction,
    requestHint,
    giveUp,
    reset,
  } = usePracticeAttempt(exercise);
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

  const finishedPractice: FinishedPractice | null =
    evaluation && feedback ? { attempt, evaluation, feedback } : null;

  return {
    attempt,
    evaluation,
    hints,
    hintReady,
    finished,
    finishedPractice,
    refusal,
    sendInput,
    sendWorkspaceKey,
    sendWorkspaceAction,
    requestHint,
    giveUp,
    reset,
  };
}
