import type { CalibrationResult, RungOutcome } from "@tutor-nvim/pedagogy";
import { cardClass, primaryButton } from "../ui/styles";

const OUTCOMES: Readonly<Record<RungOutcome, { icon: string; text: string }>> = {
  passed: { icon: "✓", text: "Solved" },
  failed: { icon: "✗", text: "Not yet" },
  assumed: { icon: "≈", text: "Assumed from what you solved" },
  untested: { icon: "–", text: "Not checked" },
};

interface EstimateStepProps {
  /** `null` when the check was skipped. */
  readonly calibration: CalibrationResult | null;
  readonly onFinish: () => void;
}

/** The initial estimate (PRD 41): a starting point, not a grade. */
export function EstimateStep({ calibration, onFinish }: EstimateStepProps) {
  return (
    <div className="space-y-5">
      {calibration === null ? (
        <p className="text-zinc-300">
          You skipped the check, so you start at the very beginning. The first sessions are short.
        </p>
      ) : (
        <>
          <p className="text-zinc-300" data-testid="estimate-summary">
            {calibration.placedRung < 0
              ? "You will start from the very beginning."
              : "You will start past what you already showed."}{" "}
            This is a starting point, not a grade: skills are only mastered through practice over
            time.
          </p>
          <ul className={`${cardClass} space-y-2`} data-testid="estimate-rungs">
            {calibration.rungs.map((rung) => {
              const outcome = OUTCOMES[rung.outcome];
              return (
                <li key={rung.skillId} className="flex justify-between gap-4">
                  <span>{rung.topic}</span>
                  <span>
                    <span aria-hidden>{outcome.icon} </span>
                    {outcome.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <button type="button" autoFocus onClick={onFinish} className={primaryButton}>
        Start training
      </button>
    </div>
  );
}
