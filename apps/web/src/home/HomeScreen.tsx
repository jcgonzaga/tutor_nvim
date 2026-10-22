import {
  DEFAULT_PEDAGOGY_CONFIG,
  activeSessionFor,
  recommendNext,
  resolveStages,
  runProgress,
} from "@tutor-nvim/pedagogy";
import { SyncStatusLine } from "../cloud/AccountScreen";
import { StatsCard } from "../gamification/StatsCard";
import { localDateKey } from "../clock";
import { describeRecommendation } from "../format";
import { useContent, useT } from "../i18n/I18nProvider";
import { useProfile } from "../profile/ProfileProvider";
import type { Route } from "../router";
import { KeyHint } from "../ui/Kbd";
import { Page } from "../ui/Page";
import { cardClass, linkClass, primaryButton } from "../ui/styles";
import { MasteryCard } from "./MasteryCard";
import { ReviewsCard } from "./ReviewsCard";
import { SessionBlocks } from "./SessionBlocks";

/** Daily home (T-512): one obvious action, plus what the next session will focus on. */
export function HomeScreen({ navigate }: { readonly navigate: (route: Route) => void }) {
  const { profile, clock } = useProfile();
  const t = useT();
  const { skills, skillTitle } = useContent();
  const now = clock.now();
  const today = localDateKey(now);
  const active = activeSessionFor(profile, today);
  const doneToday = profile.sessions.some((entry) => entry.date === today && !entry.abandoned);
  const recommendation = recommendNext(skills, profile.learner, now);
  const stages = resolveStages(skills, profile.learner, DEFAULT_PEDAGOGY_CONFIG);
  const completedDays = new Set(
    profile.sessions.filter((entry) => !entry.abandoned).map((entry) => entry.date),
  );

  let title = t.home.session.readyTitle;
  let label = t.home.session.continueLabel;
  let detail = t.home.session.readyDetail;
  if (active) {
    const { done, total } = runProgress(active.run);
    title = t.home.session.resumeTitle;
    detail = t.home.session.inProgress(done, total);
  } else if (doneToday) {
    title = t.home.session.doneTitle;
    label = t.home.session.moreLabel;
    detail = t.home.session.doneDetail;
  }

  return (
    <Page title={title}>
      <div className="-mt-6 flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
          <section
            aria-labelledby="continue-heading"
            className={`${cardClass} flex flex-col gap-7 !p-8`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 id="continue-heading" className="text-[28px] font-bold tracking-[-0.01em]">
                {label}
              </h2>
              <span className="text-[15px] text-ink-3">{t.home.session.daily}</span>
            </div>
            <p data-testid="home-detail" className="text-lg text-ink-2">
              {detail}
            </p>
            {active ? <SessionBlocks run={active.run} /> : null}
            <p data-testid="home-recommendation" className="text-[15px] text-ink-2">
              {describeRecommendation(recommendation, skillTitle, now, t.common)}
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <button
                type="button"
                autoFocus
                onClick={() => navigate({ name: "session" })}
                className={`${primaryButton} !pr-3`}
              >
                {label}
                <KeyHint>Enter</KeyHint>
              </button>
              <a href="#/map" className={linkClass}>
                {t.home.session.practiceSkill}
              </a>
            </div>
          </section>

          <ReviewsCard learner={profile.learner} now={now} />
        </div>

        <aside
          aria-label={t.home.progressAria}
          className="flex min-w-0 flex-[1_1_320px] flex-col gap-6"
        >
          <StatsCard game={profile.gamification} today={today} completedDays={completedDays} />
          <MasteryCard stages={stages} />
        </aside>
      </div>
      <SyncStatusLine />
    </Page>
  );
}
