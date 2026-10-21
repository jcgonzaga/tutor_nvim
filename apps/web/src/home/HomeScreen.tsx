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
import { skills, skillTitle } from "../exercises";
import { describeRecommendation } from "../format";
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
  const now = clock.now();
  const today = localDateKey(now);
  const active = activeSessionFor(profile, today);
  const doneToday = profile.sessions.some((entry) => entry.date === today && !entry.abandoned);
  const recommendation = recommendNext(skills, profile.learner, now);
  const stages = resolveStages(skills, profile.learner, DEFAULT_PEDAGOGY_CONFIG);
  const completedDays = new Set(
    profile.sessions.filter((entry) => !entry.abandoned).map((entry) => entry.date),
  );

  let title = "Your session for today is ready";
  let label = "Continue Training";
  let detail = "A short session built from what is due and what is next.";
  if (active) {
    const { done, total } = runProgress(active.run);
    title = "Pick up where you left off";
    detail = `Session in progress: ${done} of ${total} done.`;
  } else if (doneToday) {
    title = "Today's session is done";
    label = "Train more";
    detail = "Today's session is done. Another one is optional.";
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
              <span className="text-[15px] text-ink-3">Daily session</span>
            </div>
            <p data-testid="home-detail" className="text-lg text-ink-2">
              {detail}
            </p>
            {active ? <SessionBlocks run={active.run} /> : null}
            <p data-testid="home-recommendation" className="text-[15px] text-ink-2">
              {describeRecommendation(recommendation, skillTitle, now)}
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
                Or practice a specific skill
              </a>
            </div>
          </section>

          <ReviewsCard learner={profile.learner} now={now} />
        </div>

        <aside aria-label="Your progress" className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <StatsCard game={profile.gamification} today={today} completedDays={completedDays} />
          <MasteryCard stages={stages} />
        </aside>
      </div>
      <SyncStatusLine />
    </Page>
  );
}
