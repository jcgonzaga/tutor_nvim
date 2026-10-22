import { currentStreak, levelFor, type GamificationState } from "@tutor-nvim/pedagogy";
import { useContent, useT } from "../i18n/I18nProvider";
import { cardClass, sectionLabelClass } from "../ui/styles";
import { describeStreak } from "./messages";

const DAY_MS = 86_400_000;
/** `YYYY-MM-DD` as a UTC midnight, so adding whole days never meets a DST change. */
const dayStart = (key: string): number => Date.parse(`${key}T00:00:00Z`);
const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The seven days of today's week (Monday first), as keys. */
function weekOf(today: string): string[] {
  const start = dayStart(today);
  const sinceMonday = (new Date(start).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => dayKey(start - (sinceMonday - i) * DAY_MS));
}

interface StatsCardProps {
  readonly game: GamificationState;
  readonly today: string;
  /** Days (`YYYY-MM-DD`) on which a daily session was completed, for the week row. */
  readonly completedDays: ReadonlySet<string>;
}

function Check() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <path d="M3 8.5l3 3 7-7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Streak, level and the latest record, for the home screen (PRD 37). Words first, symbols second. */
export function StatsCard({ game, today, completedDays }: StatsCardProps) {
  const t = useT();
  const words = t.gamification;
  const content = useContent();
  const level = levelFor(game.xp);
  const recent = game.recentBests[game.recentBests.length - 1];
  const recentTitle = recent
    ? (content.findExercise(recent.exerciseId)?.title ?? recent.exerciseId)
    : null;
  const streak = currentStreak(game.streak, today);
  const week = weekOf(today);

  return (
    <>
      <section aria-labelledby="streak-heading" className={`${cardClass} flex flex-col gap-4`}>
        <h2 id="streak-heading" className={sectionLabelClass}>
          {words.stats.streakHeading}
        </h2>
        <div data-testid="stats-streak" data-streak={streak} className="flex flex-col gap-2">
          <p className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="text-[44px] font-extrabold leading-none tracking-[-0.02em]"
            >
              {streak}
            </span>
            <span className="text-ink-2">{describeStreak(game, today, words)}</span>
          </p>
        </div>
        <ol aria-label={words.stats.thisWeek} className="grid grid-cols-7 gap-1.5 text-center">
          {week.map((day, index) => {
            const done = completedDays.has(day);
            const isToday = day === today;
            return (
              <li key={day} className="flex flex-col items-center gap-1.5">
                <span
                  aria-hidden
                  className={`box-border flex h-8 w-8 items-center justify-center rounded-lg ${
                    done
                      ? "bg-amber text-amber-ink"
                      : isToday
                        ? "border-2 border-dashed border-amber"
                        : "bg-raised"
                  }`}
                >
                  {done ? <Check /> : null}
                </span>
                <span className={`text-[13px] ${isToday ? "font-bold text-amber" : "text-ink-3"}`}>
                  {isToday ? words.stats.today : words.stats.weekdays[index]}
                  <span className="sr-only">{done ? words.stats.sessionDone : ""}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-[15px] text-ink-2">{words.stats.margin}</p>
      </section>

      <section aria-label={words.stats.levelLabel} className={`${cardClass} flex flex-col gap-3`}>
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-[15px]">
          <span data-testid="stats-level" className="font-bold">
            {words.stats.level(level.level)}
          </span>
          <span data-testid="stats-xp" className="font-mono text-sm text-ink-3">
            {words.stats.xpProgress(game.xp, level.into, level.needed, level.level + 1)}
          </span>
        </p>
        <progress
          value={level.into}
          max={level.needed}
          aria-label={words.stats.levelProgress(level.level)}
          className="h-1.5 w-full overflow-hidden rounded-full accent-amber [&::-moz-progress-bar]:bg-amber [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-amber"
        />
        <p className="border-t border-line pt-3 text-sm text-ink-3">{words.stats.xpVsMastery}</p>
      </section>

      {recent && recentTitle ? (
        <section aria-labelledby="pb-heading" className={`${cardClass} flex flex-col gap-2`}>
          <h2 id="pb-heading" className={sectionLabelClass}>
            {words.stats.recentBestHeading}
          </h2>
          <p data-testid="stats-recent-best" className="text-ink-2">
            {words.stats.recentBest(
              recentTitle,
              recent.metrics.map((metric) => words.stats.metrics[metric]).join(", "),
            )}
          </p>
        </section>
      ) : null}
    </>
  );
}
