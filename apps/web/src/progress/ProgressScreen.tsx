import { MASTERY_STAGES, currentStreak, levelFor } from "@tutor-nvim/pedagogy";
import { localDateKey } from "../clock";
import { skills } from "../exercises";
import { formatWhen } from "../format";
import { useT } from "../i18n/I18nProvider";
import { useProfile } from "../profile/ProfileProvider";
import { Page } from "../ui/Page";
import { Segments } from "../ui/Segments";
import { cardClass, linkClass } from "../ui/styles";
import { summarizeProgress } from "./summary";

export function ProgressScreen() {
  const { profile, clock } = useProfile();
  const t = useT();
  const now = clock.now();
  const summary = summarizeProgress(profile, skills, now);

  return (
    <Page title={t.progress.title} eyebrow={t.progress.eyebrow}>
      <div className="flex max-w-[760px] flex-col gap-6">
        <dl className={`${cardClass} grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[17px]`}>
          <dt className="text-ink-2">{t.progress.sessions}</dt>
          <dd data-testid="progress-sessions" className="font-bold">
            {summary.sessionsCompleted}
          </dd>
          <dt className="text-ink-2">{t.progress.attempts}</dt>
          <dd data-testid="progress-attempts" className="font-bold">
            {summary.attempts}
          </dd>
          <dt className="text-ink-2">{t.progress.solved}</dt>
          <dd data-testid="progress-success" className="font-bold">
            {summary.successRate === null ? "-" : `${summary.successRate}%`}
          </dd>
          <dt className="text-ink-2">{t.progress.xp}</dt>
          <dd data-testid="progress-xp" className="font-bold">
            {t.progress.xpLevel(profile.gamification.xp, levelFor(profile.gamification.xp).level)}
          </dd>
          <dt className="text-ink-2">{t.progress.streak}</dt>
          <dd data-testid="progress-streak" className="font-bold">
            {t.progress.streakValue(
              currentStreak(profile.gamification.streak, localDateKey(now)),
              profile.gamification.streak.longest,
            )}
          </dd>
          <dt className="text-ink-2">{t.progress.bestCombo}</dt>
          <dd data-testid="progress-combo" className="font-bold">
            ×{profile.gamification.bestCombo}
          </dd>
          <dt className="text-ink-2">{t.progress.reviewsDue}</dt>
          <dd data-testid="progress-due" className="font-bold">
            {summary.reviewsDue}
          </dd>
          <dt className="text-ink-2">{t.progress.nextReview}</dt>
          <dd data-testid="progress-next-review" className="font-bold">
            {summary.nextReviewAt === null
              ? t.progress.nothingAhead
              : formatWhen(summary.nextReviewAt, now, t.common)}
          </dd>
        </dl>

        <section aria-labelledby="stages-heading" className="flex flex-col gap-3">
          <h2 id="stages-heading" className="text-xl font-bold">
            {t.progress.skills(summary.skillCount)}
          </h2>
          <ul data-testid="progress-stages" className={`${cardClass} flex flex-col gap-3`}>
            {[...MASTERY_STAGES].reverse().map((stage) => (
              <li
                key={stage}
                className={`flex items-center gap-3 ${stage === "locked" ? "text-ink-3" : ""}`}
              >
                <Segments stage={stage} />
                <span className="flex-1">{t.common.stages[stage]}</span>
                <span className="font-mono font-bold">{summary.stageCounts[stage]}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="flex gap-6 text-base">
          <a href="#/" className={linkClass}>
            {t.progress.backToToday}
          </a>
          <a href="#/map" className={linkClass}>
            {t.progress.skillMap}
          </a>
        </p>
      </div>
    </Page>
  );
}
