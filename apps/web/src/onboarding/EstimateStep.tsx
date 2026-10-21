import type { CalibrationResult, RungOutcome } from "@tutor-nvim/pedagogy";
import { KeyHint } from "../ui/Kbd";
import { cardClass, primaryButton } from "../ui/styles";

/** Each outcome has its own symbol and words, so it never relies on colour. */
const OUTCOMES: Readonly<Record<RungOutcome, { icon: string; text: string; tone: string }>> = {
  passed: { icon: "✓", text: "Solved", tone: "text-azure" },
  failed: { icon: "✗", text: "Not yet", tone: "text-ember-ink" },
  assumed: { icon: "≈", text: "Assumed from what you solved", tone: "text-ink-2" },
  untested: { icon: "–", text: "Not checked", tone: "text-ink-3" },
};

interface EstimateStepProps {
  /** `null` when the check was skipped. */
  readonly calibration: CalibrationResult | null;
  readonly onFinish: () => void;
}

/** The initial estimate (PRD 41): a starting point, not a grade. */
export function EstimateStep({ calibration, onFinish }: EstimateStepProps) {
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      {calibration === null ? (
        <p className="text-lg text-ink-2">
          You skipped the check, so you start at the very beginning. The first sessions are short.
        </p>
      ) : (
        <>
          <p className="text-lg text-ink-2" data-testid="estimate-summary">
            {calibration.placedRung < 0
              ? "You will start from the very beginning."
              : "You will start past what you already showed."}{" "}
            This is a starting point, not a grade: skills are only mastered through practice over
            time.
          </p>
          <ul className={`${cardClass} flex flex-col gap-3`} data-testid="estimate-rungs">
            {calibration.rungs.map((rung) => {
              const outcome = OUTCOMES[rung.outcome];
              return (
                <li key={rung.skillId} className="flex justify-between gap-4">
                  <span>{rung.topic}</span>
                  <span className={outcome.tone}>
                    <span aria-hidden>{outcome.icon} </span>
                    {outcome.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div>
        <button type="button" autoFocus onClick={onFinish} className={`${primaryButton} !pr-3`}>
          Start training
          <KeyHint>Enter</KeyHint>
        </button>
      </div>
    </div>
  );
}
