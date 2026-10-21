import { useState } from "react";
import { ghostComparison, masterRun, runOf } from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import type { ComboResult, RunRecord, XpAward } from "@tutor-nvim/pedagogy";
import type { FinishedPractice } from "../practice/PracticeScreen";
import { quietButton } from "../ui/styles";
import { GhostComparison } from "./GhostComparison";
import { ReplayPanel, type ReplaySource } from "./ReplayPanel";
import { RewardLine } from "./RewardLine";

interface FeedbackExtrasProps {
  readonly exercise: Exercise;
  readonly finished: FinishedPractice;
  readonly award: XpAward;
  readonly combo?: ComboResult;
  /** The exercise's best run *before* this attempt, to compare with. */
  readonly previousBest: RunRecord | null;
}

/** What follows the feedback: XP and combo, the ghost comparison, and a replay of the run. */
export function FeedbackExtras({
  exercise,
  finished,
  award,
  combo,
  previousBest,
}: FeedbackExtrasProps) {
  const [replaying, setReplaying] = useState(false);
  const you = runOf(finished.attempt);
  const rows = ghostComparison(exercise, you, previousBest);

  const sources: ReplaySource[] = [
    { id: "you", label: "Your run", keys: you.keys, times: you.times },
  ];
  const master = masterRun(exercise);
  if (master) sources.push({ id: "master", label: "Master", keys: master.keys });
  if (previousBest && previousBest.keys.join("") !== you.keys.join("")) {
    sources.push({
      id: "best",
      label: "Your best",
      keys: previousBest.keys,
      times: previousBest.times,
    });
  }

  return (
    <div className="space-y-3">
      <RewardLine award={award} {...(combo ? { combo } : {})} />
      <GhostComparison rows={rows} />
      {exercise.kind === "vim" ? (
        <>
          <button
            type="button"
            className={quietButton}
            aria-expanded={replaying}
            onClick={() => setReplaying((current) => !current)}
          >
            {replaying ? "Hide replay" : "Replay"}
          </button>
          {replaying ? <ReplayPanel exercise={exercise} sources={sources} /> : null}
        </>
      ) : null}
    </div>
  );
}
