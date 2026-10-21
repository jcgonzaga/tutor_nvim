import { exercises } from "./exercises";
import { PracticeScreen } from "./practice/PracticeScreen";

export function App() {
  const requested = new URLSearchParams(window.location.search).get("exercise");
  const exercise = exercises.find((candidate) => candidate.slug === requested) ?? exercises[0];

  if (!exercise) return <p className="p-6">No exercises found.</p>;
  return <PracticeScreen key={exercise.id} exercise={exercise} />;
}
