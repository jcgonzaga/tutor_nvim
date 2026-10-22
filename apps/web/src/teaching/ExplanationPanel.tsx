import type { ExplanationPlan } from "@tutor-nvim/evaluation";
import type { Skill } from "@tutor-nvim/exercise-schema";
import { useT } from "../i18n/I18nProvider";
import { sectionLabelClass } from "../ui/styles";
import { LessonCards } from "./LessonCards";

interface ExplanationPanelProps {
  readonly plan: ExplanationPlan;
  /** Why the best solution works (the exercise's `explanation`, in the current language). */
  readonly explanation: string | undefined;
  /** Skills the exercise trains, to offer their theory without leaving the session. */
  readonly skills: readonly Skill[];
}

/**
 * Shown after an attempt that was not solved or scored 50 or lower (ADR-0005). It explains; it never
 * grades. Nothing here is shown before or during the attempt, and good attempts see nothing.
 */
export function ExplanationPanel({ plan, explanation, skills }: ExplanationPanelProps) {
  const t = useT();
  if (plan.reason === null) return null;
  const withTheory = skills.filter((skill) => skill.lesson.length > 0);
  return (
    <section
      aria-labelledby="explanation-heading"
      data-testid="explanation"
      className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5"
    >
      <h3 id="explanation-heading" className="text-[22px] font-bold">
        {t.teaching.explanation.heading}
      </h3>
      <p className="text-base text-ink-2">
        {plan.reason === "unsolved"
          ? t.teaching.explanation.unsolved
          : t.teaching.explanation.lowScore}
      </p>
      {explanation ? (
        <p data-testid="explanation-text" className="text-pretty text-lg text-ink">
          {explanation}
        </p>
      ) : null}
      {plan.antiPatterns.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className={sectionLabelClass}>{t.teaching.explanation.habits}</p>
          <ul className="flex flex-col gap-2">
            {plan.antiPatterns.map((id) => (
              <li key={id} className="text-base text-ink-2">
                <strong className="text-ink">{t.common.antiPatterns[id].name}.</strong>{" "}
                {t.common.antiPatterns[id].explain}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {withTheory.map((skill) => (
        <details key={skill.slug} className="rounded-lg border border-line">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-ink-2 hover:text-amber">
            {t.teaching.explanation.theory(skill.title)}
          </summary>
          <div className="px-4 pb-4">
            <LessonCards skill={skill} />
          </div>
        </details>
      ))}
    </section>
  );
}
