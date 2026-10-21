import { activeSessionFor, recommendNext, runProgress } from "@tutor-nvim/pedagogy";
import { SyncStatusLine } from "../cloud/AccountScreen";
import { StatsCard } from "../gamification/StatsCard";
import { useCloud } from "../cloud/CloudProvider";
import { localDateKey } from "../clock";
import { skills, skillTitle } from "../exercises";
import { describeRecommendation } from "../format";
import { useProfile } from "../profile/ProfileProvider";
import type { Route } from "../router";
import { Page } from "../ui/Page";
import { cardClass, linkClass, primaryButton } from "../ui/styles";

/** Daily home (T-512): one obvious action, plus what the next session will focus on. */
export function HomeScreen({ navigate }: { readonly navigate: (route: Route) => void }) {
  const { profile, clock } = useProfile();
  const cloud = useCloud();
  const now = clock.now();
  const today = localDateKey(now);
  const active = activeSessionFor(profile, today);
  const doneToday = profile.sessions.some((entry) => entry.date === today && !entry.abandoned);
  const recommendation = recommendNext(skills, profile.learner, now);

  let label = "Continue Training";
  let detail = "A short session built from what is due and what is next.";
  if (active) {
    const { done, total } = runProgress(active.run);
    detail = `Session in progress: ${done} of ${total} done.`;
  } else if (doneToday) {
    label = "Train more";
    detail = "Today's session is done. Another one is optional.";
  }

  return (
    <Page title="Today" eyebrow="Tutor NeoVim">
      <section className={`${cardClass} space-y-3`}>
        <p data-testid="home-detail" className="text-zinc-300">
          {detail}
        </p>
        <p data-testid="home-recommendation" className="text-sm text-zinc-400">
          {describeRecommendation(recommendation, skillTitle, now)}
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => navigate({ name: "session" })}
          className={primaryButton}
        >
          {label}
        </button>
      </section>

      <StatsCard game={profile.gamification} today={today} />

      <nav aria-label="Main" className="flex gap-6 text-sm">
        <a href="#/map" className={linkClass}>
          Skill map
        </a>
        <a href="#/progress" className={linkClass}>
          Progress
        </a>
        {cloud.enabled ? (
          <a href="#/account" className={linkClass}>
            {cloud.user ? "Account" : "Sign in"}
          </a>
        ) : null}
      </nav>
      <SyncStatusLine />
    </Page>
  );
}
