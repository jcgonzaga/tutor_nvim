import type { CalibrationResult, RungOutcome } from "@tutor-nvim/pedagogy";
import { useT } from "../i18n/I18nProvider";
import { KeyHint } from "../ui/Kbd";
import { cardClass, primaryButton } from "../ui/styles";

/** Each outcome has its own symbol and words, so it never relies on colour. */
const OUTCOMES: Readonly<Record<RungOutcome, { icon: string; tone: string }>> = {
  passed: { icon: "✓", tone: "text-azure" },
  failed: { icon: "✗", tone: "text-ember-ink" },
  assumed: { icon: "≈", tone: "text-ink-2" },
  untested: { icon: "–", tone: "text-ink-3" },
};

interface EstimateStepProps {
  /** `null` when the check was skipped. */
  readonly calibration: CalibrationResult | null;
  readonly onFinish: () => void;
}

/** The initial estimate (PRD 41): a starting point, not a grade. */
export function EstimateStep({ calibration, onFinish }: EstimateStepProps) {
  const t = useT().onboarding.estimate;
  const topics: Readonly<Record<string, string | undefined>> = t.topics;
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      {calibration === null ? (
        <p className="text-lg text-ink-2">{t.skipped}</p>
      ) : (
        <>
          <p className="text-lg text-ink-2" data-testid="estimate-summary">
            {calibration.placedRung < 0 ? t.fromBeginning : t.pastShown}
          </p>
          <ul className={`${cardClass} flex flex-col gap-3`} data-testid="estimate-rungs">
            {calibration.rungs.map((rung) => {
              const outcome = OUTCOMES[rung.outcome];
              return (
                <li key={rung.skillId} className="flex justify-between gap-4">
                  <span>{topics[rung.skillId] ?? rung.topic}</span>
                  <span className={outcome.tone}>
                    <span aria-hidden>{outcome.icon} </span>
                    {t.outcomes[rung.outcome]}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div>
        <button type="button" autoFocus onClick={onFinish} className={`${primaryButton} !pr-3`}>
          {t.start}
          <KeyHint>Enter</KeyHint>
        </button>
      </div>
    </div>
  );
}
