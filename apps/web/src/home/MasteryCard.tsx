import { MASTERY_STAGES, type MasteryStage } from "@tutor-nvim/pedagogy";
import { useT } from "../i18n/I18nProvider";
import { Segments } from "../ui/Segments";
import { cardClass, sectionLabelClass } from "../ui/styles";

/** How many skills sit at each stage, most advanced first. */
export function MasteryCard({
  stages,
}: {
  readonly stages: Readonly<Record<string, MasteryStage>>;
}) {
  const t = useT();
  const all = Object.values(stages);
  const count = (stage: MasteryStage) => all.filter((value) => value === stage).length;
  const mastered = count("mastered");
  return (
    <section aria-labelledby="mastery-heading" className={`${cardClass} flex flex-col gap-4`}>
      <h2 id="mastery-heading" className={sectionLabelClass}>
        {t.home.mastery.title}
      </h2>
      <p className="flex items-baseline gap-2.5">
        <span data-testid="home-mastered" className="text-[44px] font-extrabold leading-none">
          {mastered}
        </span>
        <span className="text-ink-2">{t.home.mastery.summary(all.length)}</span>
      </p>
      <ul className="flex flex-col gap-2.5 text-base">
        {[...MASTERY_STAGES].reverse().map((stage) => (
          <li
            key={stage}
            className={`flex items-center gap-3 ${stage === "locked" ? "text-ink-3" : ""}`}
          >
            <Segments stage={stage} />
            <span className="flex-1">{t.common.stages[stage]}</span>
            <span className="font-bold">{count(stage)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
