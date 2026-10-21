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
import { cardClass, linkClass } from "../ui/styles";
import { layoutSkillGraph } from "./layout";
import { STAGE_DISPLAY } from "./stages";

const NODE_W = 210;
const NODE_H = 84;
const GAP_X = 72;
const GAP_Y = 24;
const PAD = 8;

const graph = layoutSkillGraph(skills);
const slot = new Map(graph.nodes.map((node) => [node.slug, node]));
const left = (column: number) => PAD + column * (NODE_W + GAP_X);
const top = (row: number) => PAD + row * (NODE_H + GAP_Y);
const width = PAD * 2 + graph.columns * NODE_W + Math.max(0, graph.columns - 1) * GAP_X;
const height = PAD * 2 + graph.rows * NODE_H + Math.max(0, graph.rows - 1) * GAP_Y;

/** Skill map (T-521): the prerequisite graph from content, with each skill's state in text and icon. */
export function SkillMapScreen() {
  const { profile, clock } = useProfile();
  const now = clock.now();
  const stages = resolveStages(skills, profile.learner, DEFAULT_PEDAGOGY_CONFIG);
  const titles = new Map(skills.map((skill) => [skill.slug, skill.title]));

  return (
    <Page title="Skill map" eyebrow="Tutor NeoVim" wide>
      <p className="text-zinc-300">
        Skills unlock when what they build on is practiced. Select a skill for details.
      </p>

      <ul aria-label="Legend" className={`${cardClass} flex flex-wrap gap-x-6 gap-y-1 text-sm`}>
        {MASTERY_STAGES.map((stage) => (
          <li key={stage}>
            <span aria-hidden>{STAGE_DISPLAY[stage].icon} </span>
            {STAGE_DISPLAY[stage].label}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto pb-2">
        <div className="relative" style={{ width, height }} data-testid="skill-graph">
          <svg width={width} height={height} aria-hidden className="absolute inset-0">
            {graph.edges.map((edge) => {
              const from = slot.get(edge.from);
              const to = slot.get(edge.to);
              if (!from || !to) return null;
              const x1 = left(from.column) + NODE_W;
              const y1 = top(from.row) + NODE_H / 2;
              const x2 = left(to.column);
              const y2 = top(to.row) + NODE_H / 2;
              const mid = (x1 + x2) / 2;
              return (
                <path
                  key={`${edge.from}>${edge.to}`}
                  d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="text-zinc-600"
                />
              );
            })}
          </svg>

          {graph.nodes.map((node) => {
            const stage = stages[node.slug] ?? "locked";
            const display = STAGE_DISPLAY[stage];
            const due = isDue(getUserSkill(profile.learner, node.slug), now);
            return (
              <a
                key={node.slug}
                href={`#/skill/${encodeURIComponent(node.slug)}`}
                data-testid={`skill-node-${node.slug}`}
                data-stage={stage}
                style={{
                  left: left(node.column),
                  top: top(node.row),
                  width: NODE_W,
                  height: NODE_H,
                }}
                className={`absolute flex flex-col justify-between rounded border-2 p-2 text-sm hover:bg-zinc-800 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400 ${display.nodeClass}`}
              >
                <span className="font-semibold leading-tight">{titles.get(node.slug)}</span>
                <span className="flex items-center justify-between text-xs">
                  <span>
                    <span aria-hidden>{display.icon} </span>
                    {display.label}
                  </span>
                  {due ? <span>Review due</span> : null}
                </span>
              </a>
            );
          })}
        </div>
      </div>

      <a href="#/" className={linkClass}>
        Back to today
      </a>
    </Page>
  );
}
