import { planExplanation, type AttemptEvaluation } from "@tutor-nvim/evaluation";
import type { Exercise, Skill } from "@tutor-nvim/exercise-schema";
import { useContent } from "../i18n/I18nProvider";
import { ExplanationPanel } from "./ExplanationPanel";

/**
 * The "why" after an attempt that was not solved or scored 50 or lower. `exercise` must be the
 * localized one (it carries the explanation in the current language).
 */
export function AttemptExplanation({
  exercise,
  evaluation,
}: {
  readonly exercise: Exercise;
  readonly evaluation: AttemptEvaluation;
}) {
  const content = useContent();
  const plan = planExplanation(evaluation);
  if (plan.reason === null) return null;
  const skills = exercise.skillIds
    .map((slug) => content.findSkill(slug))
    .filter((skill): skill is Skill => skill !== undefined);
  return <ExplanationPanel plan={plan} explanation={exercise.explanation} skills={skills} />;
}
