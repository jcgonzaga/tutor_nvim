import { useEffect, useState } from "react";
import {
  activeSessionFor,
  applyAttempt,
  buildDailySession,
  completeSessionItem,
  currentItem,
  endSession,
  isRunFinished,
  runProgress,
  startSession,
  type PersonalBestMetric,
  type Profile,
} from "@tutor-nvim/pedagogy";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { localDateKey } from "../clock";
import { exerciseIdsForSkill, exercises, findExercise, skills } from "../exercises";
import { FeedbackPanel } from "../practice/FeedbackPanel";
import { PracticeScreen, type FinishedPractice } from "../practice/PracticeScreen";
import { useProfile } from "../profile/ProfileProvider";
import type { Route } from "../router";
import { Page } from "../ui/Page";
import { primaryButton, secondaryButton } from "../ui/styles";
import { SessionSummaryView } from "./SessionSummaryView";

const BLOCK_LABELS = {
  warmup: "Warm-up",
  reviews: "Review",
  learn: "Learn",
  mixed: "Mixed practice",
  challenge: "Challenge",
} as const;

const METRIC_LABELS: Readonly<Record<PersonalBestMetric, string>> = {
  time: "speed",
  efficiency: "efficiency",
  performance: "score",
  reaction: "reaction time",
};

/** The exercise whose feedback is on screen. The run has already moved on; the screen has not. */
interface Held {
  readonly exercise: Exercise;
  readonly index: number;
  readonly improved: readonly PersonalBestMetric[];
}

const completeOptions = {
  exerciseIdsForSkill,
  skillsOf: (exerciseId: string) => findExercise(exerciseId)?.skillIds ?? [],
};

/**
 * The daily session (T-512, T-513). The plan is built once and stored in the profile, so the day's
 * list does not shift under the learner and a reload resumes where they left off. Every finished
 * exercise is applied to the profile and saved before its feedback is even read.
 */
export function SessionScreen({ navigate }: { readonly navigate: (route: Route) => void }) {
  const { profile, clock, update } = useProfile();
  const [held, setHeld] = useState<Held | null>(null);
  const today = localDateKey(clock.now());
  const active = activeSessionFor(profile, today);

  // Start (or replace a stale) session. Idempotent against the latest profile, so React's
  // double-invoked effects in development cannot build two sessions.
  useEffect(() => {
    if (!profile.onboarding.completed) return;
    update((current) => {
      if (activeSessionFor(current, today) !== null) return current;
      const now = clock.now();
      const stale = current.activeSession !== null ? endSession(current, now, true) : current;
      const doneToday = stale.sessions.filter(
        (entry) => entry.date === today && !entry.abandoned,
      ).length;
      const plan = buildDailySession({
        userId: stale.userId,
        date: today,
        seed: doneToday > 0 ? `extra-${doneToday}` : undefined,
        now,
        skills,
        exercises,
        learner: stale.learner,
        history: stale.history,
      });
      return startSession(stale, plan, now);
    });
  }, [profile.onboarding.completed, today, clock, update]);

  if (active === null) return null;
  const run = active.run;

  function handleFinish(exercise: Exercise, finished: FinishedPractice) {
    const at = clock.now();
    let improved: readonly PersonalBestMetric[] = [];
    update((current: Profile) => {
      const applied = applyAttempt(current, skills, {
        exercise,
        metrics: finished.evaluation.metrics,
        at,
      });
      improved = applied.improved;
      return completeSessionItem(
        applied.profile,
        {
          success: finished.evaluation.success,
          performance: finished.evaluation.metrics.performanceScore,
          at,
          scheduledReview: applied.updates.some((update) => update.scheduledReview),
          improved: applied.improved,
          skillUpdates: applied.updates,
        },
        completeOptions,
      );
    });
    setHeld({ exercise, index: run.completed.length, improved });
  }

  if (held === null && isRunFinished(run)) {
    return (
      <SessionSummaryView
        run={run}
        profile={profile}
        now={clock.now()}
        onDone={() => {
          update((current) => endSession(current, clock.now(), false));
          navigate({ name: "home" });
        }}
      />
    );
  }

  const item = currentItem(run);
  const exercise = held?.exercise ?? (item ? findExercise(item.exerciseId) : undefined);
  if (!exercise) {
    return (
      <Page title="Session">
        <p>This session refers to an exercise that no longer exists.</p>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            update((current) => endSession(current, clock.now(), true));
            navigate({ name: "home" });
          }}
        >
          Close session
        </button>
      </Page>
    );
  }

  const { done, total } = runProgress(run);
  const shownIndex = held?.index ?? done;
  const block = held ? run.completed[held.index]?.block : item?.block;
  const repeat = held ? run.completed[held.index]?.repeat : item?.repeat;

  return (
    <PracticeScreen
      key={`${shownIndex}:${exercise.id}`}
      exercise={exercise}
      eyebrow={`${block ? BLOCK_LABELS[block] : "Session"}${repeat ? " · again" : ""}`}
      progress={`${Math.min(shownIndex + 1, total)} of ${total}`}
      giveUpLabel="I don't know this"
      onFinish={(finished) => handleFinish(exercise, finished)}
      renderResult={(finished) => (
        <FeedbackPanel finished={finished}>
          {held && held.improved.length > 0 ? (
            <p data-testid="personal-best" className="mr-auto self-center text-sm">
              <span aria-hidden>🏆 </span>
              New personal best: {held.improved.map((metric) => METRIC_LABELS[metric]).join(", ")}
            </p>
          ) : null}
          <button type="button" className={primaryButton} onClick={() => setHeld(null)}>
            {isRunFinished(run) ? "Finish" : "Continue"}
          </button>
        </FeedbackPanel>
      )}
    />
  );
}
