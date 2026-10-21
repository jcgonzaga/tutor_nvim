import { MASTERY_STAGES, currentStreak, levelFor } from "@tutor-nvim/pedagogy";
import { localDateKey } from "../clock";
import { skills } from "../exercises";
import { formatWhen } from "../format";
import { STAGE_DISPLAY } from "../map/stages";
import { useProfile } from "../profile/ProfileProvider";
import { Page } from "../ui/Page";
import { cardClass, linkClass } from "../ui/styles";
import { summarizeProgress } from "./summary";

export function ProgressScreen() {
  const { profile, clock } = useProfile();
  const now = clock.now();
  const summary = summarizeProgress(profile, skills, now);

  return (
    <Page title="Progress" eyebrow="Tutor NeoVim">
      <dl className={`${cardClass} grid grid-cols-[auto_1fr] gap-x-6 gap-y-2`}>
        <dt className="text-zinc-400">Sessions completed</dt>
        <dd data-testid="progress-sessions">{summary.sessionsCompleted}</dd>
        <dt className="text-zinc-400">Exercises attempted</dt>
        <dd data-testid="progress-attempts">{summary.attempts}</dd>
        <dt className="text-zinc-400">Solved</dt>
        <dd data-testid="progress-success">
          {summary.successRate === null ? "-" : `${summary.successRate}%`}
        </dd>
        <dt className="text-zinc-400">XP</dt>
        <dd data-testid="progress-xp">
          {profile.gamification.xp} XP · level {levelFor(profile.gamification.xp).level}
        </dd>
        <dt className="text-zinc-400">Streak</dt>
        <dd data-testid="progress-streak">
          {currentStreak(profile.gamification.streak, localDateKey(now))} days (longest{" "}
          {profile.gamification.streak.longest})
        </dd>
        <dt className="text-zinc-400">Best combo</dt>
        <dd data-testid="progress-combo">×{profile.gamification.bestCombo}</dd>
        <dt className="text-zinc-400">Reviews due now</dt>
        <dd data-testid="progress-due">{summary.reviewsDue}</dd>
        <dt className="text-zinc-400">Next review</dt>
        <dd data-testid="progress-next-review">
          {summary.nextReviewAt === null
            ? "Nothing scheduled ahead"
            : formatWhen(summary.nextReviewAt, now)}
        </dd>
      </dl>

      <section aria-labelledby="stages-heading" className="space-y-2">
        <h2 id="stages-heading" className="text-lg font-semibold">
          Skills ({summary.skillCount})
        </h2>
        <ul data-testid="progress-stages" className={`${cardClass} space-y-1`}>
          {MASTERY_STAGES.map((stage) => (
            <li key={stage} className="flex justify-between">
              <span>
                <span aria-hidden>{STAGE_DISPLAY[stage].icon} </span>
                {STAGE_DISPLAY[stage].label}
              </span>
              <span className="font-mono">{summary.stageCounts[stage]}</span>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label="Main" className="flex gap-6 text-sm">
        <a href="#/" className={linkClass}>
          Back to today
        </a>
        <a href="#/map" className={linkClass}>
          Skill map
        </a>
      </nav>
    </Page>
  );
}
