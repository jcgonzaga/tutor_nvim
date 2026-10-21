import { currentStreak, levelFor, type GamificationState } from "@tutor-nvim/pedagogy";
import { findExercise } from "../exercises";
import { cardClass } from "../ui/styles";
import { describeStreak } from "./messages";

const METRICS = {
  time: "speed",
  efficiency: "efficiency",
  performance: "score",
  reaction: "reaction time",
} as const;

/** XP, level, streak and the latest record, for the home screen (PRD 37). */
export function StatsCard({ game, today }: { readonly game: GamificationState; today: string }) {
  const level = levelFor(game.xp);
  const recent = game.recentBests[game.recentBests.length - 1];
  const recentTitle = recent ? (findExercise(recent.exerciseId)?.title ?? recent.exerciseId) : null;
  const streak = currentStreak(game.streak, today);

  return (
    <section aria-label="Your game stats" className={`${cardClass} space-y-3`}>
      <div>
        <p className="flex justify-between text-sm">
          <span data-testid="stats-level">Level {level.level}</span>
          <span data-testid="stats-xp" className="font-mono text-zinc-400">
            {game.xp} XP · {level.into}/{level.needed} to level {level.level + 1}
          </span>
        </p>
        <progress
          value={level.into}
          max={level.needed}
          aria-label={`Level ${level.level} progress`}
          className="mt-1 h-2 w-full accent-sky-400"
        />
      </div>
      <p data-testid="stats-streak" data-streak={streak}>
        <span aria-hidden>{streak > 0 ? "🔥 " : ""}</span>
        {describeStreak(game, today)}
      </p>
      {recent && recentTitle ? (
        <p data-testid="stats-recent-best" className="text-sm text-zinc-300">
          <span aria-hidden>🏆 </span>
          Recent personal best: {recentTitle} (
          {recent.metrics.map((metric) => METRICS[metric]).join(", ")})
        </p>
      ) : null}
    </section>
  );
}
