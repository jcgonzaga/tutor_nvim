import {
  summarizeRun,
  type Profile,
  type SessionRewards,
  type SessionRun,
} from "@tutor-nvim/pedagogy";
import { describeRecommendation } from "../format";
import { findExercise, skills, skillTitle } from "../exercises";
import { KeyHint } from "../ui/Kbd";
import { Page } from "../ui/Page";
import { cardClass, primaryButton } from "../ui/styles";

interface SessionSummaryViewProps {
  readonly run: SessionRun;
  readonly profile: Profile;
  /** What finishing the session paid; `null` for a session closed another way. */
  readonly rewards: SessionRewards | null;
  readonly bestCombo: number;
  readonly now: number;
  readonly onDone: () => void;
}

/** End-of-session summary (T-515): skills trained, reviews completed, personal bests, what is next. */
export function SessionSummaryView({
  run,
  profile,
  rewards,
  bestCombo,
  now,
  onDone,
}: SessionSummaryViewProps) {
  const summary = summarizeRun(run, skills, profile.learner, now);
  const tiles: readonly (readonly [label: string, testId: string, value: string, note?: string])[] =
    [
      ["Exercises", "summary-exercises", `${summary.successes} solved of ${summary.exercises}`],
      ["Average score", "summary-score", String(Math.round(summary.averagePerformance))],
      ["Reviews completed", "summary-reviews", String(summary.reviewsCompleted)],
      [
        "XP",
        "summary-xp",
        `+${summary.xp + (rewards?.dailyBonusXp ?? 0)} XP`,
        rewards && rewards.dailyBonusXp > 0
          ? `including ${rewards.dailyBonusXp} for finishing today's session`
          : undefined,
      ],
      ["Best combo", "summary-combo", `×${bestCombo}`],
      [
        "Streak",
        "summary-streak",
        rewards
          ? `${rewards.streak}-day streak${rewards.firstOfDay ? "" : " (today already counted)"}`
          : "-",
      ],
    ];

  return (
    <Page title="Session complete" eyebrow="Summary">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
        {tiles.map(([label, testId, value, note]) => (
          <div
            key={testId}
            className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-5 py-[18px]"
          >
            <dt className="text-sm text-ink-2">{label}</dt>
            <dd data-testid={testId} className="m-0 text-2xl font-extrabold leading-tight">
              {value}
              {note ? <span className="block text-sm font-normal text-ink-3">{note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-6">
        <section aria-labelledby="trained-heading" className={`${cardClass} flex flex-col gap-3`}>
          <h2 id="trained-heading" className="text-xl font-bold">
            Skills trained
          </h2>
          <ul
            data-testid="summary-skills"
            className="flex list-disc flex-col gap-1 pl-6 text-ink-2"
          >
            {summary.skillsTrained.map((skillId) => (
              <li key={skillId}>{skillTitle(skillId)}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="records-heading" className={`${cardClass} flex flex-col gap-3`}>
          <h2 id="records-heading" className="text-xl font-bold">
            Personal bests
          </h2>
          {summary.personalBests.length === 0 ? (
            <p data-testid="summary-records" className="text-ink-2">
              No new records this time. They show up when you beat an earlier solve.
            </p>
          ) : (
            <ul
              data-testid="summary-records"
              className="flex list-disc flex-col gap-1 pl-6 text-ink-2"
            >
              {summary.personalBests.map((record) => (
                <li key={record.exerciseId}>
                  <span aria-hidden className="text-amber">
                    ★{" "}
                  </span>
                  {findExercise(record.exerciseId)?.title ?? record.exerciseId}:{" "}
                  {record.metrics.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p data-testid="summary-next" className="text-lg text-ink-2">
        {describeRecommendation(summary.next, skillTitle, now)}
      </p>

      <div>
        <button type="button" autoFocus onClick={onDone} className={`${primaryButton} !pr-3`}>
          Done
          <KeyHint>Enter</KeyHint>
        </button>
      </div>
    </Page>
  );
}
