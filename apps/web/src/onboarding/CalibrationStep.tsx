import { useState } from "react";
import type { Attempt, AttemptEvaluation } from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import {
  CALIBRATION_LADDER,
  isCalibrationDone,
  nextRung,
  pickCalibrationExercise,
  recordRung,
  startCalibration,
  type CalibrationState,
  type ExperienceLevel,
} from "@tutor-nvim/pedagogy";
import { useContent, useT } from "../i18n/I18nProvider";
import { FeedbackPanel } from "../practice/FeedbackPanel";
import { PracticeScreen } from "../practice/PracticeScreen";
import { primaryButton } from "../ui/styles";

/** One probe the learner attempted; applied to the profile only when onboarding completes. */
export interface ProbeRecord {
  readonly exercise: Exercise;
  readonly metrics: AttemptEvaluation["metrics"];
  /** The inputs, kept so the attempt can be uploaded and replayed by the server. */
  readonly attempt: Attempt;
  readonly success: boolean;
}

export interface CalibrationOutcome {
  readonly state: CalibrationState;
  readonly probes: readonly ProbeRecord[];
}

interface CalibrationStepProps {
  readonly experience: ExperienceLevel;
  readonly onDone: (outcome: CalibrationOutcome) => void;
}

/**
 * A probe counts as passed only when solved without hints: placing a learner too high skips
 * content they need, so help earns no placement. Nothing is saved until the check is over, so
 * leaving halfway (or reloading) neither double-counts attempts nor leaves a half-estimate.
 */
export function CalibrationStep({ experience, onDone }: CalibrationStepProps) {
  const t = useT().onboarding.calibration;
  const content = useContent();
  const [state, setState] = useState(() => startCalibration(experience));
  const [probes, setProbes] = useState<readonly ProbeRecord[]>([]);

  const rung = nextRung(state);
  const probe =
    rung === null
      ? null
      : pickCalibrationExercise(
          content.skills,
          content.exercises,
          CALIBRATION_LADDER[rung]?.skillId ?? "",
        );
  // A rung without content cannot be asked, so the check ends with what it already knows.
  if (rung === null || probe === null) {
    return (
      <button type="button" onClick={() => onDone({ state, probes })} className={primaryButton}>
        {t.seeStart}
      </button>
    );
  }

  return (
    <PracticeScreen
      key={rung}
      exercise={probe}
      eyebrow={t.eyebrow}
      progress={t.progress(probes.length + 1)}
      giveUpLabel={t.giveUp}
      renderResult={(finished) => (
        <FeedbackPanel finished={finished}>
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              const passed = finished.evaluation.success && finished.feedback.hintsUsed === 0;
              const nextState = recordRung(state, rung, passed);
              const nextProbes = [
                ...probes,
                {
                  exercise: probe,
                  metrics: finished.evaluation.metrics,
                  attempt: finished.attempt,
                  success: finished.evaluation.success,
                },
              ];
              setState(nextState);
              setProbes(nextProbes);
              if (isCalibrationDone(nextState)) onDone({ state: nextState, probes: nextProbes });
            }}
          >
            {t.next}
          </button>
        </FeedbackPanel>
      )}
    />
  );
}
