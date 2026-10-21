import { exercises } from "./exercises";
import { PracticeScreen } from "./practice/PracticeScreen";

export function App() {
  const requested = new URLSearchParams(window.location.search).get("exercise");
  const index = Math.max(
    0,
    exercises.findIndex((candidate) => candidate.slug === requested),
  );
  const exercise = exercises[index];
  // Wraps around, so "Next exercise" always has somewhere to go.
  const next = exercises[(index + 1) % exercises.length];

  if (!exercise) return <p className="p-6">No exercises found.</p>;
  return <PracticeScreen key={exercise.id} exercise={exercise} nextSlug={next?.slug ?? null} />;
}
