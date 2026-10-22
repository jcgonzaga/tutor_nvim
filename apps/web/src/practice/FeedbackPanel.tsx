import type { ReactNode } from "react";
import type { FeedbackKind } from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { AttemptExplanation } from "../teaching/AttemptExplanation";
import type { FinishedPractice } from "./PracticeScreen";
import { useT } from "../i18n/I18nProvider";
import { Kbd } from "../ui/Kbd";
import { sectionLabelClass } from "../ui/styles";

function Icon({ kind }: { readonly kind: FeedbackKind }) {
  if (kind === "perfect") {
    return (
      <svg aria-hidden width="48" height="48" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="27" fill="#f4b740" />
        <path
          d="M17 29l7.5 7.5L39.5 21"
          stroke="#17130a"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "completed") {
    return (
      <svg aria-hidden width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="22.5" stroke="#848c96" strokeWidth="2" />
        <path
          d="M15 25l6 6 12-13"
          stroke="#b0b7c0"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      stroke="#e5683e"
      strokeLinecap="round"
    >
      <circle cx="24" cy="24" r="22.5" strokeWidth="2" />
      <path d="M17 17l14 14M31 17L17 31" strokeWidth="3.5" />
    </svg>
  );
}

/** The keys of a run, one keycap per key; key names come as a string of tokens like `ci"<Esc>`. */
function Keys({ text, state }: { readonly text: string; readonly state: "plain" | "next" }) {
  const tokens = text.match(/<[^>]+>|./g) ?? [];
  return (
    <span className="flex flex-wrap gap-1.5">
      {tokens.map((token, index) => (
        <Kbd key={index} size="sm" state={state}>
          {token.startsWith("<") ? token.slice(1, -1) : token === " " ? "␣" : token}
        </Kbd>
      ))}
    </span>
  );
}

interface FeedbackPanelProps {
  readonly finished: FinishedPractice;
  /** The (localized) exercise: with it, a poor attempt is explained below the keys (ADR-0005). */
  readonly exercise?: Exercise;
  /** XP, comparison and replay (sessions only). */
  readonly extras?: ReactNode;
  /** Next-step controls (Continue, Try again...). */
  readonly children: ReactNode;
}

/** Per-exercise feedback (T-514): perfect / completed / failed, plus what to try next time. */
export function FeedbackPanel({ finished, exercise, extras, children }: FeedbackPanelProps) {
  const t = useT().practice.feedback;
  const { feedback, evaluation } = finished;
  const headline = t[feedback.kind];
  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="feedback"
      className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-8"
    >
      <div className="flex items-center gap-4">
        <Icon kind={feedback.kind} />
        <div>
          <h2 className="text-[40px] font-extrabold leading-none tracking-[-0.03em]">
            <span data-testid="feedback-kind">{headline.title}</span>
          </h2>
          <p className="mt-1.5 text-base text-ink-2">{headline.detail}</p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-canvas/40 p-5">
          <dt className={sectionLabelClass}>{t.youTyped}</dt>
          <dd data-testid="feedback-your-keys" className="sr-only">
            {feedback.yourKeys || t.nothing}
          </dd>
          <dd className="m-0" aria-hidden>
            {feedback.yourKeys ? <Keys text={feedback.yourKeys} state="plain" /> : t.nothing}
          </dd>
        </div>
        {feedback.betterKeys ? (
          <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-5">
            <dt className="text-[15px] font-bold text-amber">
              {feedback.kind === "failed" ? t.oneWay : t.betterWay}
            </dt>
            <dd data-testid="feedback-better-keys" className="sr-only">
              {feedback.betterKeys}
            </dd>
            <dd className="m-0" aria-hidden>
              <Keys text={feedback.betterKeys} state="next" />
            </dd>
          </div>
        ) : null}
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-canvas/40 p-5">
          <dt className={sectionLabelClass}>{t.score}</dt>
          <dd
            data-testid="feedback-performance"
            className="m-0 text-[32px] font-extrabold leading-tight"
          >
            {Math.round(evaluation.metrics.performanceScore)}
          </dd>
        </div>
      </dl>

      {feedback.hintsUsed > 0 ? (
        <p className="text-base text-ink-2">{t.hintsUsed(feedback.hintsUsed)}</p>
      ) : null}
      {exercise ? <AttemptExplanation exercise={exercise} evaluation={evaluation} /> : null}
      {extras}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}
