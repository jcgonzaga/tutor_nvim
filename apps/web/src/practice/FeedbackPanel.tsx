import type { ReactNode } from "react";
import type { FeedbackKind } from "@tutor-nvim/evaluation";
import type { FinishedPractice } from "./PracticeScreen";
import { cardClass } from "../ui/styles";

/** Icon plus words: the outcome is never carried by color alone. */
const HEADLINES: Readonly<Record<FeedbackKind, { icon: string; text: string; detail: string }>> = {
  perfect: {
    icon: "★",
    text: "Perfect",
    detail: "Best strategy, no errors, no hints.",
  },
  completed: {
    icon: "✓",
    text: "Completed",
    detail: "Solved. There is a cleaner way.",
  },
  failed: {
    icon: "✗",
    text: "Not solved",
    detail: "That is useful information: it will come back for review.",
  },
};

interface FeedbackPanelProps {
  readonly finished: FinishedPractice;
  /** Next-step controls (Continue, Try again...). */
  readonly children: ReactNode;
}

/** Per-exercise feedback (T-514): perfect / completed / failed, plus what to try next time. */
export function FeedbackPanel({ finished, children }: FeedbackPanelProps) {
  const { feedback, evaluation } = finished;
  const headline = HEADLINES[feedback.kind];
  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="feedback"
      className={`${cardClass} space-y-3`}
    >
      <h2 className="text-lg font-semibold">
        <span aria-hidden>{headline.icon} </span>
        <span data-testid="feedback-kind">{headline.text}</span>
      </h2>
      <p className="text-sm text-zinc-300">{headline.detail}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-sm">
        <dt className="text-zinc-400">You typed</dt>
        <dd data-testid="feedback-your-keys">{feedback.yourKeys || "(nothing)"}</dd>
        {feedback.betterKeys ? (
          <>
            <dt className="text-zinc-400">
              {feedback.kind === "failed" ? "One way" : "Better way"}
            </dt>
            <dd data-testid="feedback-better-keys">{feedback.betterKeys}</dd>
          </>
        ) : null}
        <dt className="text-zinc-400">Score</dt>
        <dd data-testid="feedback-performance">
          {Math.round(evaluation.metrics.performanceScore)}
        </dd>
      </dl>

      {feedback.hintsUsed > 0 ? (
        <p className="text-sm text-zinc-300">
          {feedback.hintsUsed === 1 ? "1 hint used" : `${feedback.hintsUsed} hints used`}: it counts
          less toward mastery.
        </p>
      ) : null}
      <div className="flex gap-3">{children}</div>
    </section>
  );
}
