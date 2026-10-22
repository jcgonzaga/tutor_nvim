import type { Skill } from "@tutor-nvim/exercise-schema";
import { KeyCaps } from "../ui/KeyCaps";

/** All of a skill's theory cards in a list: for reviewing it without the step-by-step flow. */
export function LessonCards({ skill }: { readonly skill: Skill }) {
  return (
    <ol className="flex flex-col gap-4">
      {skill.lesson.map((card, index) => (
        <li key={index} className="flex flex-col gap-1.5">
          <h4 className="text-lg font-bold">{card.title}</h4>
          <p className="text-pretty text-base text-ink-2">{card.body}</p>
          {card.keys ? (
            skill.domain === "linux" ? (
              <code className="w-fit rounded-md border border-line-strong bg-raised px-2.5 py-1 font-mono text-[15px]">
                {card.keys}
              </code>
            ) : (
              <KeyCaps keys={card.keys} size="xs" />
            )
          ) : null}
        </li>
      ))}
    </ol>
  );
}
