import type { ExerciseHint } from "@tutor-nvim/exercise-schema";
import { useT } from "../i18n/I18nProvider";
import { quietButton } from "../ui/styles";

interface PracticeHintsProps {
  /** The hints revealed so far, in order. */
  readonly revealed: readonly ExerciseHint[];
  /** Whether there is another hint to ask for. */
  readonly hasNext: boolean;
  /** Whether the clock allows the next one yet. */
  readonly hintReady: boolean;
  readonly onHint: () => void;
  /** Word of the control that ends the attempt as a failure ("Skip", "I don't know yet"). */
  readonly giveUpLabel?: string | undefined;
  readonly onGiveUp: () => void;
}

/**
 * The hints under the practice area, shared by every kind of exercise (T8).
 *
 * It only draws: asking for a hint is the screen's decision, and the clock that delays one is the
 * screen hook's, so the vim, shell and workspace views cannot drift apart on when a hint shows.
 */
export function PracticeHints({
  revealed,
  hasNext,
  hintReady,
  onHint,
  giveUpLabel,
  onGiveUp,
}: PracticeHintsProps) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <ol
        data-testid="hints"
        aria-live="polite"
        className="flex flex-col gap-2 text-[17px] text-ink-2"
      >
        {revealed.map((hint) => (
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
              <span className="text-ink-3">{t.practice.hintLabel(hint.level)}</span>
              {hint.text}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        {hasNext ? (
          <button type="button" onClick={onHint} disabled={!hintReady} className={quietButton}>
            {hintReady ? t.practice.showHint : t.practice.hintSoon}
          </button>
        ) : null}
        {giveUpLabel ? (
          <button type="button" onClick={onGiveUp} className={quietButton}>
            {giveUpLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
