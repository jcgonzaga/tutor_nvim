import { useState } from "react";
import { EXPERIENCE_LEVELS, type ExperienceLevel } from "@tutor-nvim/pedagogy";
import { useT } from "../i18n/I18nProvider";
import { primaryButton, secondaryButton } from "../ui/styles";

interface ExperienceStepProps {
  readonly initial: ExperienceLevel | null;
  readonly onCalibrate: (experience: ExperienceLevel) => void;
  readonly onSkip: (experience: ExperienceLevel) => void;
  readonly onBack: () => void;
}

export function ExperienceStep({ initial, onCalibrate, onSkip, onBack }: ExperienceStepProps) {
  const t = useT().onboarding.experience;
  const [experience, setExperience] = useState<ExperienceLevel>(initial ?? "never");
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
        <legend className="mb-3 text-lg text-ink-2">{t.question}</legend>
        {EXPERIENCE_LEVELS.map((level) => (
          <label
            key={level}
            className={`flex min-h-14 cursor-pointer items-center gap-3.5 rounded-xl border-2 px-5 py-3 text-[17px] ${
              experience === level ? "border-amber bg-panel" : "border-line bg-surface"
            }`}
          >
            <input
              type="radio"
              name="experience"
              value={level}
              checked={experience === level}
              onChange={() => setExperience(level)}
              className="size-[22px] flex-none accent-amber"
            />
            {t.levels[level]}
          </label>
        ))}
      </fieldset>
      <p className="text-[15px] text-ink-3">{t.note}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className={secondaryButton}>
          {t.back}
        </button>
        <button type="button" onClick={() => onCalibrate(experience)} className={primaryButton}>
          {t.startCheck}
        </button>
        <button type="button" onClick={() => onSkip(experience)} className={secondaryButton}>
          {t.skipCheck}
        </button>
      </div>
    </div>
  );
}
