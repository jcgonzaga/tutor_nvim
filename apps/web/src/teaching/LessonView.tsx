import { useState, type KeyboardEvent } from "react";
import type { Skill } from "@tutor-nvim/exercise-schema";
import { useT } from "../i18n/I18nProvider";
import { KeyCaps } from "../ui/KeyCaps";
import { KeyHint } from "../ui/Kbd";
import { eyebrowClass, linkClass, primaryButton, secondaryButton } from "../ui/styles";

/** Shell lessons show a command; Vim lessons show keys. Only the latter are keycaps. */
function LessonKeys({ skill, keys }: { readonly skill: Skill; readonly keys: string }) {
  if (skill.domain === "linux") {
    return (
      <code className="inline-block rounded-lg border border-line-strong bg-raised px-3 py-2 font-mono text-lg text-ink">
        {keys}
      </code>
    );
  }
  return <KeyCaps keys={keys} size="md" />;
}

interface LessonViewProps {
  readonly skill: Skill;
  /** Called when the learner finishes the cards or skips them. */
  readonly onDone: () => void;
}

/**
 * The Discover stage (PRD §8): one idea per screen, a few seconds each, skippable. Arrow keys move
 * between cards and Esc skips; the keys only act while focus is inside, so nothing is captured
 * outside this region (AGENTS 19).
 */
export function LessonView({ skill, onDone }: LessonViewProps) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const card = skill.lesson[index];
  if (!card) return null;
  const last = index === skill.lesson.length - 1;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onDone();
    else if (event.key === "ArrowRight" && !last) setIndex(index + 1);
    else if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    else return;
    event.preventDefault();
  };

  return (
    <section
      aria-label={t.teaching.lesson.region(skill.title)}
      data-testid="lesson"
      onKeyDown={onKeyDown}
      className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-8 py-12"
    >
      <p className={eyebrowClass}>{t.teaching.lesson.eyebrow(skill.title)}</p>
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-8">
        <p className="text-sm font-semibold text-ink-3" data-testid="lesson-progress">
          {t.teaching.lesson.progress(index + 1, skill.lesson.length)}
        </p>
        <h2 className="text-balance text-[32px] font-bold leading-tight tracking-[-0.02em]">
          {card.title}
        </h2>
        <p className="text-pretty text-xl leading-relaxed text-ink-2">{card.body}</p>
        {card.keys ? (
          <div className="flex flex-col gap-2 pt-2">
            <span className="sr-only">{t.teaching.lesson.keysLabel}</span>
            <LessonKeys skill={skill} keys={card.keys} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {index > 0 ? (
          <button type="button" className={secondaryButton} onClick={() => setIndex(index - 1)}>
            {t.teaching.lesson.back}
          </button>
        ) : null}
        <button
          type="button"
          autoFocus
          className={`${primaryButton} !pr-3`}
          onClick={() => (last ? onDone() : setIndex(index + 1))}
        >
          {last ? t.teaching.lesson.start : t.teaching.lesson.next}
          <KeyHint>{last ? "Enter" : "→"}</KeyHint>
        </button>
        <button type="button" className={linkClass} onClick={onDone}>
          {t.teaching.lesson.skip}
        </button>
      </div>
    </section>
  );
}
