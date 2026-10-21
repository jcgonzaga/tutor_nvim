import { currentStreak, levelFor, type GamificationState } from "@tutor-nvim/pedagogy";
import { findExercise } from "../exercises";
import { cardClass, sectionLabelClass } from "../ui/styles";
import { describeStreak } from "./messages";

const METRICS = {
  time: "speed",
  efficiency: "efficiency",
  performance: "score",
  reaction: "reaction time",
} as const;

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

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
  const level = levelFor(game.xp);
  const recent = game.recentBests[game.recentBests.length - 1];
  const recentTitle = recent ? (findExercise(recent.exerciseId)?.title ?? recent.exerciseId) : null;
  const streak = currentStreak(game.streak, today);
  const week = weekOf(today);

  return (
    <>
      <section aria-labelledby="streak-heading" className={`${cardClass} flex flex-col gap-4`}>
        <h2 id="streak-heading" className={sectionLabelClass}>
          Streak
        </h2>
        <div data-testid="stats-streak" data-streak={streak} className="flex flex-col gap-2">
          <p className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="text-[44px] font-extrabold leading-none tracking-[-0.02em]"
            >
              {streak}
            </span>
            <span className="text-ink-2">{describeStreak(game, today)}</span>
          </p>
        </div>
        <ol aria-label="This week" className="grid grid-cols-7 gap-1.5 text-center">
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
                  {isToday ? "Today" : WEEKDAYS[index]}
                  <span className="sr-only">{done ? ", session done" : ""}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-[15px] text-ink-2">
          A missed day does not break your streak: you have one day of margin.
        </p>
      </section>

      <section aria-label="Your level" className={`${cardClass} flex flex-col gap-3`}>
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-[15px]">
          <span data-testid="stats-level" className="font-bold">
            Level {level.level}
          </span>
          <span data-testid="stats-xp" className="font-mono text-sm text-ink-3">
            {game.xp} XP · {level.into}/{level.needed} to level {level.level + 1}
          </span>
        </p>
        <progress
          value={level.into}
          max={level.needed}
          aria-label={`Level ${level.level} progress`}
          className="h-1.5 w-full overflow-hidden rounded-full accent-amber [&::-moz-progress-bar]:bg-amber [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-amber"
        />
        <p className="border-t border-line pt-3 text-sm text-ink-3">
          XP measures what you practice. Mastery measures what you can really do.
        </p>
      </section>

      {recent && recentTitle ? (
        <section aria-labelledby="pb-heading" className={`${cardClass} flex flex-col gap-2`}>
          <h2 id="pb-heading" className={sectionLabelClass}>
            Recent personal best
          </h2>
          <p data-testid="stats-recent-best" className="text-ink-2">
            Recent personal best: {recentTitle} (
            {recent.metrics.map((metric) => METRICS[metric]).join(", ")})
          </p>
        </section>
      ) : null}
    </>
  );
}
