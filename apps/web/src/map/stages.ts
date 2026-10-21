import type { MasteryStage } from "@tutor-nvim/pedagogy";

export interface StageDisplay {
  /** The state in words: it always accompanies the segment gauge, so color is never the only signal. */
  readonly label: string;
  /** What the stage asks of the learner. */
  readonly meaning: string;
}

export const STAGE_DISPLAY: Readonly<Record<MasteryStage, StageDisplay>> = {
  locked: { label: "Locked", meaning: "Requirements missing" },
  learning: { label: "Learning", meaning: "Discover and imitate" },
  practicing: { label: "Practicing", meaning: "Recall without help" },
  fluent: { label: "Fluent", meaning: "Fast and without doubt" },
  mastered: { label: "Mastered", meaning: "Retained and transferred" },
};
