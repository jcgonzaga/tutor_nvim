import { useContent, useT } from "./i18n/I18nProvider";
import { PracticeScreen } from "./practice/PracticeScreen";

/**
 * Free practice on one exercise (`?exercise=<slug>`): no profile, no scheduling. Kept for linking
 * to a single exercise and for the practice-loop E2E tests.
 */
export function FreePractice({ slug }: { readonly slug: string }) {
  const t = useT();
  const { exercises } = useContent();
  const index = Math.max(
    0,
    exercises.findIndex((candidate) => candidate.slug === slug),
  );
  const exercise = exercises[index];
  // Wraps around, so "Next exercise" always has somewhere to go.
  const next = exercises[(index + 1) % exercises.length];

  if (!exercise) return <p className="p-6">{t.app.noExercises}</p>;
  return <PracticeScreen key={exercise.id} exercise={exercise} nextSlug={next?.slug ?? null} />;
}
