import { DAY_MS, type LearnerState } from "@tutor-nvim/pedagogy";
import { skillTitle } from "../exercises";
import { cardClass } from "../ui/styles";

interface Bucket {
  readonly label: string;
  readonly skills: readonly string[];
  readonly urgent: boolean;
}

/** Skills with a scheduled review, grouped by when it falls due. Empty groups are left out. */
export function reviewBuckets(learner: LearnerState, now: number): Bucket[] {
  const groups = {
    today: [] as string[],
    tomorrow: [] as string[],
    week: [] as string[],
    later: [] as string[],
  };
  const entries = Object.entries(learner.skills)
    .filter(([, state]) => state.nextReviewAt !== null)
    .sort((a, b) => (a[1].nextReviewAt ?? 0) - (b[1].nextReviewAt ?? 0));
  for (const [id, state] of entries) {
    const days = ((state.nextReviewAt ?? 0) - now) / DAY_MS;
    if (days <= 0.5) groups.today.push(id);
    else if (days <= 1.5) groups.tomorrow.push(id);
    else if (days <= 7) groups.week.push(id);
    else groups.later.push(id);
  }
  return [
    { label: "Today", skills: groups.today, urgent: true },
    { label: "Tomorrow", skills: groups.tomorrow, urgent: false },
    { label: "This week", skills: groups.week, urgent: false },
    { label: "Later", skills: groups.later, urgent: false },
  ].filter((bucket) => bucket.skills.length > 0);
}

export function ReviewsCard({
  learner,
  now,
}: {
  readonly learner: LearnerState;
  readonly now: number;
}) {
  const buckets = reviewBuckets(learner, now);
  return (
    <section
      aria-labelledby="reviews-heading"
      className={`${cardClass} flex flex-col gap-5 !px-8 !py-7`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="reviews-heading" className="text-xl font-bold">
          Scheduled reviews
        </h2>
        <span className="text-[15px] text-ink-3">They return just before you would forget</span>
      </div>
      {buckets.length === 0 ? (
        <p data-testid="reviews-empty" className="text-ink-2">
          Nothing is scheduled yet. Reviews appear after you practice a skill.
        </p>
      ) : (
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
          {buckets.map((bucket) => (
            <li
              key={bucket.label}
              className={`flex flex-col gap-2 rounded-xl border bg-raised p-4 ${
                bucket.urgent ? "border-amber" : "border-line"
              }`}
            >
              <span className={`text-sm font-bold ${bucket.urgent ? "text-amber" : "text-ink-2"}`}>
                {bucket.label} · {bucket.skills.length}
              </span>
              <span className="flex flex-wrap gap-1.5 text-sm">
                {bucket.skills.map((id) => (
                  <span key={id} className="rounded-md bg-line px-2 py-0.5">
                    {skillTitle(id)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
