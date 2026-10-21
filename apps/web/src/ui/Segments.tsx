import { MASTERY_STAGES, type MasteryStage } from "@tutor-nvim/pedagogy";

/** Filled segments per stage: the number of segments, not the colour, is the state. */
const FILLED: Readonly<Record<MasteryStage, number>> = {
  locked: 0,
  learning: 1,
  practicing: 2,
  fluent: 3,
  mastered: 4,
};

const SIZES = {
  xs: "h-2 w-2 rounded-[2px]",
  sm: "h-2 w-2.5 rounded-[2px]",
  md: "h-2.5 w-2.5 rounded-[2px]",
  lg: "h-3 w-3 rounded-[3px]",
} as const;

/** Four segments that fill up with the stage; dashed outlines when locked. Decorative. */
export function Segments({
  stage,
  size = "sm",
}: {
  readonly stage: MasteryStage;
  readonly size?: keyof typeof SIZES;
}) {
  const filled = FILLED[stage];
  return (
    <span aria-hidden className="flex gap-0.5">
      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          className={`box-border ${SIZES[size]} ${
            stage === "locked"
              ? "border border-dashed border-dash"
              : index < filled
                ? "bg-amber"
                : "bg-line-strong"
          }`}
        />
      ))}
    </span>
  );
}

export { MASTERY_STAGES };
