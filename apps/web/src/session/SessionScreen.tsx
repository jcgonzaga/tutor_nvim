import { useEffect, useState } from "react";
import {
  lessonsToShow,
  activeSessionFor,
  buildDailySession,
  completeSessionItem,
  currentItem,
  endSession,
  finishAttempt,
  isRunFinished,
  runProgress,
  startSession,
  summarizeRun,
  type ComboResult,
  type FinishedAttemptResult,
  type PersonalBestMetric,
  type SessionBlock,
  type Profile,
  type RunRecord,
  type XpAward,
} from "@tutor-nvim/pedagogy";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { useAnalytics } from "../analytics/AnalyticsProvider";
import { eventsForAttempt, eventsForCompletedSession } from "../analytics/derive";
import { useCloud } from "../cloud/CloudProvider";
import { localDateKey } from "../clock";
import { exerciseIdsForSkill, exercises, findExercise, skills } from "../exercises";
import { useContent, useT } from "../i18n/I18nProvider";
import { FeedbackPanel } from "../practice/FeedbackPanel";
import { FeedbackExtras } from "../gamification/FeedbackExtras";
import { rewardInputFor } from "../gamification/rewards";
import { usePrefs } from "../prefs/PrefsProvider";
import { cueFor, playCue } from "../prefs/sound";
import { PracticeScreen, type FinishedPractice } from "../practice/PracticeScreen";
import { useProfile } from "../profile/ProfileProvider";
import type { Route } from "../router";
import { Page } from "../ui/Page";
import { KeyHint } from "../ui/Kbd";
import { primaryButton, secondaryButton } from "../ui/styles";
import { LessonView } from "../teaching/LessonView";
import { SessionSummaryView } from "./SessionSummaryView";

/** The exercise whose feedback is on screen. The run has already moved on; the screen has not. */
interface Held {
  readonly exercise: Exercise;
  readonly index: number;
  readonly improved: readonly PersonalBestMetric[];
  readonly award: XpAward;
  readonly combo: ComboResult;
  /** The exercise's best run before this attempt, for the ghost comparison. */
  readonly previousBest: RunRecord | null;
}

// Ids and structure only (no visible text), so the source-language lookups are enough here.
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
  const t = useT();
  const content = useContent();
  const { profile, clock, update, getProfile } = useProfile();
  const cloud = useCloud();
  const analytics = useAnalytics();
  const { prefs, markLessonSeen } = usePrefs();
  const [held, setHeld] = useState<Held | null>(null);
  const today = localDateKey(clock.now());
  const active = activeSessionFor(profile, today);

  // Start (or replace a stale) session. Idempotent against the latest profile, so React's
  // double-invoked effects in development cannot build two sessions.
  useEffect(() => {
    if (!profile.onboarding.completed) return;
    const stale = getProfile().activeSession;
    if (stale !== null && stale.run.date !== today) {
      // A session left over from an earlier day closes as abandoned; the cloud hears about it too.
      cloud.recordSession(getProfile(), stale, { finishedAt: clock.now(), abandoned: true });
    }
    const alreadyActive = activeSessionFor(getProfile(), today) !== null;
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
    const started = activeSessionFor(getProfile(), today);
    if (!alreadyActive && started) {
      analytics.track({
        name: "session_started",
        props: {
          items: started.run.pending.length,
          reviews: started.run.plan.reviews.length,
        },
      });
    }
  }, [profile.onboarding.completed, today, clock, update, getProfile, cloud, analytics]);

  if (active === null) return null;
  const run = active.run;

  function handleFinish(exercise: Exercise, finished: FinishedPractice) {
    const at = clock.now();
    cloud.recordAttempt(
      exercise,
      { attempt: finished.attempt, success: finished.evaluation.success },
      at,
      getProfile().activeSession,
    );
    const reward = rewardInputFor(finished, at, true);
    const previousBest = getProfile().gamification.bestRuns[exercise.id] ?? null;
    const before = getProfile();
    const captured: {
      value?: {
        improved: readonly PersonalBestMetric[];
        award: XpAward;
        combo: ComboResult;
        updates: FinishedAttemptResult["updates"];
      };
    } = {};
    update((current: Profile) => {
      // Learning first, then the game: `finishAttempt` keeps them apart (XP never feeds mastery).
      const result = finishAttempt(
        current,
        skills,
        { exercise, metrics: finished.evaluation.metrics, at },
        reward,
      );
      captured.value = {
        improved: result.improved,
        award: result.award,
        combo: result.combo,
        updates: result.updates,
      };
      return completeSessionItem(
        result.profile,
        {
          success: finished.evaluation.success,
          performance: finished.evaluation.metrics.performanceScore,
          at,
          scheduledReview: result.updates.some((update) => update.scheduledReview),
          improved: result.improved,
          xp: result.award.total,
          skillUpdates: result.updates,
        },
        completeOptions,
      );
    });
    if (!captured.value) return;
    const { updates, ...shown } = captured.value;
    setHeld({ exercise, index: run.completed.length, previousBest, ...shown });

    // Usage events (only sent if the learner allowed it) and the optional sound.
    const after = getProfile();
    for (const event of eventsForAttempt({
      exercise,
      evaluation: finished.evaluation,
      feedback: finished.feedback.kind,
      keystrokes: finished.attempt.events.length,
      before,
      after,
      result: { improved: shown.improved, updates },
    })) {
      analytics.track(event);
    }
    const rewards = after.activeSession?.rewards;
    if (rewards && after.activeSession && !before.activeSession?.rewards) {
      const summary = summarizeRun(after.activeSession.run, skills, after.learner, at);
      for (const event of eventsForCompletedSession({ summary, rewards })) analytics.track(event);
    }
    if (prefs.sound) playCue(cueFor(finished.feedback.kind));
  }

  if (held === null && isRunFinished(run)) {
    return (
      <SessionSummaryView
        run={run}
        profile={profile}
        rewards={active.rewards}
        bestCombo={active.combo.best}
        now={clock.now()}
        onDone={() => {
          const closing = getProfile().activeSession;
          if (closing !== null) {
            cloud.recordSession(getProfile(), closing, {
              finishedAt: clock.now(),
              abandoned: false,
            });
          }
          update((current) => endSession(current, clock.now(), false));
          navigate({ name: "home" });
        }}
      />
    );
  }

  const item = currentItem(run);
  const exercise = held?.exercise ?? (item ? content.findExercise(item.exerciseId) : undefined);
  if (!exercise) {
    return (
      <Page title={t.session.missingExercise.title}>
        <p>{t.session.missingExercise.text}</p>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            update((current) => endSession(current, clock.now(), true));
            navigate({ name: "home" });
          }}
        >
          {t.session.missingExercise.close}
        </button>
      </Page>
    );
  }

  // Theory first, once per skill (ADR-0005): before the first exercise that trains a skill the
  // learner is still learning, never while a result is on screen. Skipping counts as seen.
  const lessonSkill = held
    ? undefined
    : content.findSkill(
        lessonsToShow({
          skillIds: exercise.skillIds,
          hasLesson: (slug) => (content.findSkill(slug)?.lesson.length ?? 0) > 0,
          seen: prefs.seenLessons,
          learner: profile.learner,
        })[0] ?? "",
      );
  if (lessonSkill) {
    return (
      <LessonView
        key={lessonSkill.slug}
        skill={lessonSkill}
        onDone={() => markLessonSeen(lessonSkill.slug)}
      />
    );
  }

  // The run keeps the plan's block names; the shared vocabulary says "review", not "reviews".
  const blockLabel = (block: SessionBlock): string =>
    t.common.sessionBlocks[block === "reviews" ? "review" : block];
  const { done, total } = runProgress(run);
  const shownIndex = held?.index ?? done;
  const block = held ? run.completed[held.index]?.block : item?.block;
  const repeat = held ? run.completed[held.index]?.repeat : item?.repeat;

  return (
    <PracticeScreen
      key={`${shownIndex}:${exercise.id}`}
      exercise={exercise}
      eyebrow={`${block ? blockLabel(block) : t.session.eyebrowFallback}${repeat ? t.session.repeatSuffix : ""}`}
      progress={t.session.progress(Math.min(shownIndex + 1, total), total)}
      giveUpLabel={t.session.giveUp}
      combo={active.combo.current}
      onStart={() =>
        analytics.track({
          name: "exercise_started",
          props: { exerciseId: exercise.id, block: block ?? "session", repeat: Boolean(repeat) },
        })
      }
      onHint={(level) =>
        analytics.track({ name: "hint_used", props: { exerciseId: exercise.id, level } })
      }
      onFinish={(finished) => handleFinish(exercise, finished)}
      renderResult={(finished) => (
        <FeedbackPanel
          finished={finished}
          exercise={exercise}
          extras={
            held ? (
              <FeedbackExtras
                exercise={held.exercise}
                finished={finished}
                award={held.award}
                combo={held.combo}
                previousBest={held.previousBest}
              />
            ) : null
          }
        >
          {held && held.improved.length > 0 ? (
            <p data-testid="personal-best" className="mr-auto self-center text-base text-amber">
              <span aria-hidden>★ </span>
              {t.session.newPersonalBest(
                held.improved.map((metric) => t.session.metrics[metric]).join(", "),
              )}
            </p>
          ) : null}
          <button type="button" className={`${primaryButton} !pr-3`} onClick={() => setHeld(null)}>
            {isRunFinished(run) ? t.session.finish : t.session.continue}
            <KeyHint>Enter</KeyHint>
          </button>
        </FeedbackPanel>
      )}
    />
  );
}
