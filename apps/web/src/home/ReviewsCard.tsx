import { DAY_MS, type LearnerState } from "@tutor-nvim/pedagogy";
import { useContent, useT } from "../i18n/I18nProvider";
import { en } from "../i18n/en";
import type { Messages } from "../i18n/messages";
import { cardClass } from "../ui/styles";

interface Bucket {
  readonly label: string;
  readonly skills: readonly string[];
  readonly urgent: boolean;
}

/** Skills with a scheduled review, grouped by when it falls due. Empty groups are left out. */
export function reviewBuckets(
  learner: LearnerState,
  now: number,
  words: Messages["home"]["reviews"]["buckets"] = en.home.reviews.buckets,
): Bucket[] {
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
    { label: words.today, skills: groups.today, urgent: true },
    { label: words.tomorrow, skills: groups.tomorrow, urgent: false },
    { label: words.week, skills: groups.week, urgent: false },
    { label: words.later, skills: groups.later, urgent: false },
  ].filter((bucket) => bucket.skills.length > 0);
}

export function ReviewsCard({
  learner,
  now,
}: {
  readonly learner: LearnerState;
  readonly now: number;
}) {
  const t = useT();
  const { skillTitle } = useContent();
  const buckets = reviewBuckets(learner, now, t.home.reviews.buckets);
  return (
    <section
      aria-labelledby="reviews-heading"
      className={`${cardClass} flex flex-col gap-5 !px-8 !py-7`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="reviews-heading" className="text-xl font-bold">
          {t.home.reviews.title}
        </h2>
        <span className="text-[15px] text-ink-3">{t.home.reviews.subtitle}</span>
      </div>
      {buckets.length === 0 ? (
        <p data-testid="reviews-empty" className="text-ink-2">
          {t.home.reviews.empty}
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
