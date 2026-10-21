import type { MasteryStage } from "@tutor-nvim/pedagogy";

export interface StageDisplay {
  /** Decorative; the label always accompanies it, so color and shape are never the only signal. */
  readonly icon: string;
  readonly label: string;
  /** Node look: border style carries the state too (dashed = not available yet). */
  readonly nodeClass: string;
}

export const STAGE_DISPLAY: Readonly<Record<MasteryStage, StageDisplay>> = {
  locked: {
    icon: "🔒",
    label: "Locked",
    nodeClass: "border-dashed border-zinc-600 bg-zinc-950 text-zinc-400",
  },
  learning: {
    icon: "○",
    label: "Learning",
    nodeClass: "border-solid border-sky-700 bg-zinc-900",
  },
  practicing: {
    icon: "◔",
    label: "Practicing",
    nodeClass: "border-solid border-sky-500 bg-zinc-900",
  },
  fluent: {
    icon: "◑",
    label: "Fluent",
    nodeClass: "border-solid border-emerald-500 bg-zinc-900",
  },
  mastered: {
    icon: "●",
    label: "Mastered",
    nodeClass: "border-double border-4 border-emerald-400 bg-zinc-900",
  },
};
