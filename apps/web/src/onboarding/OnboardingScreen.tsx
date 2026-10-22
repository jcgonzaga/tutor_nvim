import { useEffect, useState } from "react";
import {
  applyAttempt,
  calibrationResult,
  completeOnboarding,
  setExperience,
  setKeyboardLayout,
  type CalibrationResult,
  type ExperienceLevel,
  type Profile,
} from "@tutor-nvim/pedagogy";
import { useCloud } from "../cloud/CloudProvider";
import { useT } from "../i18n/I18nProvider";
import { skills } from "../exercises";
import { useProfile } from "../profile/ProfileProvider";
import type { Navigate } from "../router";
import { CalibrationStep, type CalibrationOutcome } from "./CalibrationStep";
import { EstimateStep } from "./EstimateStep";
import { ExperienceStep } from "./ExperienceStep";
import { LayoutStep } from "./LayoutStep";
import { OnboardingShell } from "./OnboardingShell";
import { WelcomeStep } from "./WelcomeStep";

type Step = "welcome" | "layout" | "experience" | "calibration" | "estimate";

const STEP_INDEX: Readonly<Record<Step, number>> = {
  welcome: 0,
  layout: 1,
  experience: 2,
  calibration: 3,
  estimate: 4,
};

/**
 * Onboarding (T-501..T-504): welcome, keyboard layout, experience, adaptive calibration and the
 * initial estimate. Layout and experience are saved as they are chosen. The calibration probes are
 * applied to the profile together with the estimate when the check ends, in a single update.
 */
export function OnboardingScreen({ navigate }: { readonly navigate: Navigate }) {
  const { profile, clock, update } = useProfile();
  const cloud = useCloud();
  const t = useT().onboarding;
  const [step, setStep] = useState<Step>("welcome");
  const [estimate, setEstimate] = useState<CalibrationResult | null>(null);

  // A learner who already finished onboarding has nothing to do here.
  const alreadyDone = profile.onboarding.completed && step !== "estimate";
  useEffect(() => {
    if (alreadyDone) navigate({ name: "home" }, { replace: true });
  }, [alreadyDone, navigate]);

  function finish(experience: ExperienceLevel, outcome: CalibrationOutcome | null) {
    const result = outcome ? calibrationResult(outcome.state) : null;
    const at = clock.now();
    update((current: Profile) => {
      let next = setExperience(current, experience);
      for (const probe of outcome?.probes ?? []) {
        next = applyAttempt(next, skills, {
          exercise: probe.exercise,
          metrics: probe.metrics,
          at,
        }).profile;
      }
      return completeOnboarding(next, skills, result, at);
    });
    // Queue the probes for the cloud account (a no-op when cloud sync is off), then sync: the
    // server replays them and derives the placement from the calibration itself.
    for (const probe of outcome?.probes ?? []) {
      cloud.recordAttempt(probe.exercise, probe, at);
    }
    cloud.syncNow();
    setEstimate(result);
    setStep("estimate");
  }

  if (alreadyDone) return null;

  if (step === "calibration") {
    return (
      <CalibrationStep
        experience={profile.onboarding.experience ?? "never"}
        onDone={(outcome) => finish(profile.onboarding.experience ?? "never", outcome)}
      />
    );
  }

  return (
    <OnboardingShell
      step={STEP_INDEX[step]}
      title={t.titles[step]}
      {...(step === "layout" ? { lead: t.layoutLead } : {})}
    >
      {step === "welcome" ? <WelcomeStep onNext={() => setStep("layout")} /> : null}
      {step === "layout" ? (
        <LayoutStep
          initial={profile.settings.keyboardLayout}
          onBack={() => setStep("welcome")}
          onNext={(layout) => {
            update((current) => setKeyboardLayout(current, layout));
            setStep("experience");
          }}
        />
      ) : null}
      {step === "experience" ? (
        <ExperienceStep
          initial={profile.onboarding.experience}
          onBack={() => setStep("layout")}
          onCalibrate={(experience) => {
            update((current) => setExperience(current, experience));
            setStep("calibration");
          }}
          onSkip={(experience) => finish(experience, null)}
        />
      ) : null}
      {step === "estimate" ? (
        <EstimateStep calibration={estimate} onFinish={() => navigate({ name: "home" })} />
      ) : null}
    </OnboardingShell>
  );
}
