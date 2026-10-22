import {
  DEFAULT_PEDAGOGY_CONFIG,
  getUserSkill,
  masteryBlockers,
  resolveStages,
} from "@tutor-nvim/pedagogy";
import { formatWhen } from "../format";
import { useContent, useT } from "../i18n/I18nProvider";
import { useProfile } from "../profile/ProfileProvider";
import { Page } from "../ui/Page";
import { LessonCards } from "../teaching/LessonCards";
import { Segments } from "../ui/Segments";
import { cardClass, linkClass, sectionLabelClass } from "../ui/styles";
import { describeBlocker } from "./blockers";

/** What the learner has shown for one skill. Each dimension is a number, a bar and a word. */
const DIMENSIONS = ["accuracy", "strategy", "fluency", "retention", "transfer"] as const;

const pill =
  "rounded-full border border-line px-2.5 py-1 text-sm text-ink-2 no-underline hover:text-ink";

export function SkillDetailScreen({ slug }: { readonly slug: string }) {
  const { profile, clock } = useProfile();
  const t = useT();
  const { findSkill, skills, skillTitle } = useContent();
  const skill = findSkill(slug);
  if (!skill) {
    return (
      <Page title={t.map.detail.notFound}>
        <a href="#/map" className={linkClass}>
          {t.map.detail.backToMap}
        </a>
      </Page>
    );
  }

  const now = clock.now();
  const stages = resolveStages(skills, profile.learner, DEFAULT_PEDAGOGY_CONFIG);
  const stage = stages[slug] ?? "locked";
  const state = getUserSkill(profile.learner, slug);
  const blockers = masteryBlockers(state, DEFAULT_PEDAGOGY_CONFIG);
  const dependents = skills.filter((other) => other.prerequisites.includes(slug));
  const placed = profile.learner.placed?.includes(slug) === true;

  return (
    <Page title={skill.title} eyebrow={t.map.detail.eyebrow} lead={skill.description}>
      <div className="-mt-2 flex max-w-[760px] flex-col gap-6">
        <div className={`${cardClass} flex items-center justify-between gap-4 !p-4 !bg-raised`}>
          <p
            data-testid="skill-stage"
            data-stage={stage}
            className="flex items-center gap-2.5 text-base font-bold"
          >
            <Segments stage={stage} size="md" />
            {t.common.stages[stage]}
          </p>
          {stage === "locked" ? null : (
            <p className="flex items-baseline gap-1">
              <span data-testid="skill-mastery" className="text-[32px] font-extrabold leading-none">
                {Math.round(state.mastery)}
              </span>
              <span className="text-[15px] text-ink-3">{t.map.detail.masteryOutOf}</span>
            </p>
          )}
        </div>

        {stage === "locked" ? (
          <p data-testid="skill-locked-reason" className="text-ink-2">
            {t.map.detail.lockedReason(skill.prerequisites.map(skillTitle).join(", "))}
          </p>
        ) : (
          <>
            {placed && state.attemptCount === 0 ? (
              <p className="text-[15px] text-ink-3">{t.map.detail.placedNote}</p>
            ) : null}
            <dl className={`${cardClass} flex flex-col gap-3 text-[15px]`}>
              {DIMENSIONS.map((key) => (
                <div
                  key={key}
                  className="grid grid-cols-[112px_minmax(0,1fr)_32px] items-center gap-3"
                >
                  <dt className="text-ink-2">{t.map.detail.dimensions[key]}</dt>
                  <dd className="m-0 h-1.5 overflow-hidden rounded-[3px] bg-line">
                    <span
                      className="block h-full bg-amber"
                      style={{ width: `${Math.round(state[key])}%` }}
                    />
                  </dd>
                  <dd data-testid={`skill-${key}`} className="m-0 text-right font-bold">
                    {Math.round(state[key])}
                  </dd>
                </div>
              ))}
            </dl>

            <dl className={`${cardClass} grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[15px]`}>
              <dt className="text-ink-2">{t.map.detail.attempts}</dt>
              <dd data-testid="skill-attempts">{state.attemptCount}</dd>
              <dt className="text-ink-2">{t.map.detail.nextReview}</dt>
              <dd data-testid="skill-next-review">
                {state.nextReviewAt === null
                  ? t.map.detail.notScheduled
                  : formatWhen(state.nextReviewAt, now, t.common)}
              </dd>
            </dl>

            {stage !== "mastered" && blockers.length > 0 ? (
              <section
                aria-labelledby="blockers-heading"
                className="flex flex-col gap-3 border-t border-line pt-5"
              >
                <h2 id="blockers-heading" className="text-base font-bold">
                  {t.map.detail.toMaster}
                </h2>
                <ul data-testid="skill-blockers" className="flex flex-col gap-2.5 text-[15px]">
                  {blockers.map((blocker) => (
                    <li key={blocker} className="flex items-start gap-2.5">
                      <svg
                        aria-hidden
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        className="mt-px flex-none"
                      >
                        <circle cx="10" cy="10" r="8.2" stroke="#848c96" strokeWidth="1.6" />
                      </svg>
                      <span>{describeBlocker(blocker, t.map.detail.blockerCriteria)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-ink-3">{t.map.detail.masteryNote}</p>
              </section>
            ) : null}
          </>
        )}

        {skill.lesson.length > 0 ? (
          <details data-testid="skill-theory" className={`${cardClass} !p-0`}>
            <summary className="cursor-pointer px-5 py-4 text-base font-bold hover:text-amber">
              {t.teaching.skillPage.show}
            </summary>
            <div className="px-5 pb-5">
              <LessonCards skill={skill} />
            </div>
          </details>
        ) : null}

        {skill.prerequisites.length > 0 ? (
          <div className="flex flex-col gap-2 text-sm text-ink-3">
            <span className={sectionLabelClass}>{t.map.detail.requires}</span>
            <span className="flex flex-wrap gap-2">
              {skill.prerequisites.map((id) => (
                <a key={id} href={`#/skill/${encodeURIComponent(id)}`} className={pill}>
                  {skillTitle(id)}
                </a>
              ))}
            </span>
          </div>
        ) : null}
        {dependents.length > 0 ? (
          <div className="flex flex-col gap-2 text-sm text-ink-3">
            <span className={sectionLabelClass}>{t.map.detail.leadsTo}</span>
            <span className="flex flex-wrap gap-2">
              {dependents.map((other) => (
                <a
                  key={other.slug}
                  href={`#/skill/${encodeURIComponent(other.slug)}`}
                  className={pill}
                >
                  {other.title}
                </a>
              ))}
            </span>
          </div>
        ) : null}

        <a href="#/map" className={linkClass}>
          {t.map.detail.backToMap}
        </a>
      </div>
    </Page>
  );
}
