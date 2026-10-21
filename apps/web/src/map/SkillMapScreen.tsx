import {
  DEFAULT_PEDAGOGY_CONFIG,
  MASTERY_STAGES,
  getUserSkill,
  isDue,
  resolveStages,
} from "@tutor-nvim/pedagogy";
import { skills } from "../exercises";
import { useProfile } from "../profile/ProfileProvider";
import { Page } from "../ui/Page";
import { Segments } from "../ui/Segments";
import { linkClass } from "../ui/styles";
import { layoutSkillGraph } from "./layout";
import { STAGE_DISPLAY } from "./stages";

const graph = layoutSkillGraph(skills);
const titles = new Map(skills.map((skill) => [skill.slug, skill.title]));
/** Skills grouped by column, in layout order; a column holds what needs the same depth of prerequisites. */
const columns = Array.from({ length: graph.columns }, (_, column) =>
  graph.nodes
    .filter((node) => node.column === column)
    .sort((a, b) => a.row - b.row)
    .map((node) => node.slug),
);

/** Skill map (T-521): the prerequisite graph from content, with each skill's state in text and segments. */
export function SkillMapScreen() {
  const { profile, clock } = useProfile();
  const now = clock.now();
  const stages = resolveStages(skills, profile.learner, DEFAULT_PEDAGOGY_CONFIG);

  return (
    <Page
      title="Skill map"
      wide
      lead={`${skills.length} skills. Each one unlocks when you practice the ones it builds on. Select a skill for details.`}
    >
      <ul aria-label="Legend" className="-mt-4 flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-ink-2">
        {MASTERY_STAGES.map((stage) => (
          <li key={stage} className="flex items-center gap-2">
            <Segments stage={stage} size="xs" />
            {STAGE_DISPLAY[stage].label}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto pb-2">
        <div
          data-testid="skill-graph"
          className="grid min-w-[896px] gap-3.5"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(168px, 1fr))` }}
        >
          {columns.map((slugs, column) => (
            <section key={column} aria-label={`Step ${column + 1}`} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5 border-b border-line px-0.5 pb-1.5">
                <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3">
                  Step {column + 1}
                </span>
              </div>
              {slugs.map((slug) => {
                const stage = stages[slug] ?? "locked";
                const due = isDue(getUserSkill(profile.learner, slug), now);
                const locked = stage === "locked";
                return (
                  <a
                    key={slug}
                    href={`#/skill/${encodeURIComponent(slug)}`}
                    data-testid={`skill-node-${slug}`}
                    data-stage={stage}
                    className={`flex flex-col gap-2.5 rounded-xl p-3.5 text-ink no-underline ${
                      locked
                        ? "border border-dashed border-line-strong text-ink-3 hover:bg-surface"
                        : "border border-line bg-surface hover:bg-raised"
                    }`}
                  >
                    <span className="text-base font-bold leading-[1.3]">{titles.get(slug)}</span>
                    <span
                      className={`flex items-center justify-between gap-2 text-[13px] ${
                        locked ? "" : "text-ink-2"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {locked ? <LockIcon /> : <Segments stage={stage} size="sm" />}
                        {STAGE_DISPLAY[stage].label}
                      </span>
                      {due ? <span className="font-bold text-amber">Review due</span> : null}
                    </span>
                  </a>
                );
              })}
            </section>
          ))}
        </div>
      </div>

      <a href="#/" className={linkClass}>
        Back to today
      </a>
    </Page>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  );
}
