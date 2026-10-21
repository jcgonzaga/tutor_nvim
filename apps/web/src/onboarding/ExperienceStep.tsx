import { useState } from "react";
import { EXPERIENCE_LEVELS, type ExperienceLevel } from "@tutor-nvim/pedagogy";
import { primaryButton, secondaryButton } from "../ui/styles";

const LABELS: Readonly<Record<ExperienceLevel, string>> = {
  never: "I have never used Vim",
  basics: "I know the basics (h j k l, i, Esc)",
  occasional: "I use Vim from time to time",
  regular: "I use Vim regularly",
};

interface ExperienceStepProps {
  readonly initial: ExperienceLevel | null;
  readonly onCalibrate: (experience: ExperienceLevel) => void;
  readonly onSkip: (experience: ExperienceLevel) => void;
  readonly onBack: () => void;
}

export function ExperienceStep({ initial, onCalibrate, onSkip, onBack }: ExperienceStepProps) {
  const [experience, setExperience] = useState<ExperienceLevel>(initial ?? "never");
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-zinc-300">How much Vim do you know?</legend>
        {EXPERIENCE_LEVELS.map((level) => (
          <label key={level} className="flex items-center gap-2">
            <input
              type="radio"
              name="experience"
              value={level}
              checked={experience === level}
              onChange={() => setExperience(level)}
              className="size-4 accent-sky-400"
            />
            {LABELS[level]}
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-zinc-400">
        This only decides where the short check starts. It never unlocks anything on its own: what
        you show in the check does.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onBack} className={secondaryButton}>
          Back
        </button>
        <button type="button" onClick={() => onCalibrate(experience)} className={primaryButton}>
          Start the check
        </button>
        <button type="button" onClick={() => onSkip(experience)} className={secondaryButton}>
          Skip the check, start from the beginning
        </button>
      </div>
    </div>
  );
}
