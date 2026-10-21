import type { Skill } from "@tutor-nvim/exercise-schema";

export interface GraphNode {
  readonly slug: string;
  /** Column: the longest chain of prerequisites below the skill, so prerequisites sit to the left. */
  readonly column: number;
  /** Row within the column. */
  readonly row: number;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface SkillGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly columns: number;
  readonly rows: number;
}

/**
 * Lays the skill graph out from data alone (T-521): nothing about progression is hardcoded in the
 * UI. A skill's column is the length of its longest prerequisite chain, so every edge points
 * right; within a column skills are ordered by tier then slug, so the layout is stable.
 * Prerequisites that are not in `skills` are ignored, and a cycle (rejected by content
 * validation) cannot loop: a skill met again while being measured counts as depth 0.
 */
export function layoutSkillGraph(skills: readonly Skill[]): SkillGraph {
  const enabled = skills.filter((skill) => skill.enabled);
  const bySlug = new Map(enabled.map((skill) => [skill.slug, skill]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (slug: string): number => {
    const known = depth.get(slug);
    if (known !== undefined) return known;
    if (visiting.has(slug)) return 0;
    visiting.add(slug);
    const prerequisites = (bySlug.get(slug)?.prerequisites ?? []).filter((id) => bySlug.has(id));
    const value = prerequisites.length === 0 ? 0 : 1 + Math.max(...prerequisites.map(depthOf));
    visiting.delete(slug);
    depth.set(slug, value);
    return value;
  };

  const ordered = [...enabled].sort(
    (a, b) => depthOf(a.slug) - depthOf(b.slug) || a.tier - b.tier || a.slug.localeCompare(b.slug),
  );
  const rowsUsed = new Map<number, number>();
  const nodes: GraphNode[] = ordered.map((skill) => {
    const column = depthOf(skill.slug);
    const row = rowsUsed.get(column) ?? 0;
    rowsUsed.set(column, row + 1);
    return { slug: skill.slug, column, row };
  });

  const edges: GraphEdge[] = ordered.flatMap((skill) =>
    skill.prerequisites
      .filter((prerequisite) => bySlug.has(prerequisite))
      .map((prerequisite) => ({ from: prerequisite, to: skill.slug })),
  );

  return {
    nodes,
    edges,
    columns: nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.column)) + 1,
    rows: Math.max(0, ...rowsUsed.values()),
  };
}
