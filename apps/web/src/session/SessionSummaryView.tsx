import { summarizeRun, type Profile, type SessionRun } from "@tutor-nvim/pedagogy";
import { describeRecommendation } from "../format";
import { findExercise, skills, skillTitle } from "../exercises";
import { Page } from "../ui/Page";
import { cardClass, primaryButton } from "../ui/styles";

interface SessionSummaryViewProps {
  readonly run: SessionRun;
  readonly profile: Profile;
  readonly now: number;
  readonly onDone: () => void;
}

/** End-of-session summary (T-515): skills trained, reviews completed, personal bests, what is next. */
export function SessionSummaryView({ run, profile, now, onDone }: SessionSummaryViewProps) {
  const summary = summarizeRun(run, skills, profile.learner, now);
  return (
    <Page title="Session complete" eyebrow="Summary">
      <dl className={`${cardClass} grid grid-cols-[auto_1fr] gap-x-6 gap-y-2`}>
        <dt className="text-zinc-400">Exercises</dt>
        <dd data-testid="summary-exercises">
          {summary.successes} solved of {summary.exercises}
        </dd>
        <dt className="text-zinc-400">Average score</dt>
        <dd data-testid="summary-score">{Math.round(summary.averagePerformance)}</dd>
        <dt className="text-zinc-400">Reviews completed</dt>
        <dd data-testid="summary-reviews">{summary.reviewsCompleted}</dd>
      </dl>

      <section aria-labelledby="trained-heading" className="space-y-2">
        <h2 id="trained-heading" className="text-lg font-semibold">
          Skills trained
        </h2>
        <ul data-testid="summary-skills" className="list-disc pl-6">
          {summary.skillsTrained.map((skillId) => (
            <li key={skillId}>{skillTitle(skillId)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="records-heading" className="space-y-2">
        <h2 id="records-heading" className="text-lg font-semibold">
          Personal bests
        </h2>
        {summary.personalBests.length === 0 ? (
          <p data-testid="summary-records" className="text-zinc-300">
            No new records this time. They show up when you beat an earlier solve.
          </p>
        ) : (
          <ul data-testid="summary-records" className="list-disc pl-6">
            {summary.personalBests.map((record) => (
              <li key={record.exerciseId}>
                <span aria-hidden>🏆 </span>
                {findExercise(record.exerciseId)?.title ?? record.exerciseId}:{" "}
                {record.metrics.join(", ")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p data-testid="summary-next" className="text-zinc-300">
        {describeRecommendation(summary.next, skillTitle, now)}
      </p>

      <button type="button" autoFocus onClick={onDone} className={primaryButton}>
        Done
      </button>
    </Page>
  );
}
