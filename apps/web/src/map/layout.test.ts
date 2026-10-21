import { describe, expect, it } from "vitest";
import { parseSkill, type Skill } from "@tutor-nvim/exercise-schema";
import { layoutSkillGraph } from "./layout";

const skill = (slug: string, prerequisites: string[] = [], tier = 1, enabled = true): Skill =>
  parseSkill({
    schemaVersion: 1,
    id: slug.replaceAll(".", "-"),
    slug,
    title: slug,
    description: slug,
    domain: "vim",
    tier,
    difficulty: 1,
    enabled,
    prerequisites,
  });

describe("layoutSkillGraph", () => {
  const skills = [
    skill("vim.d", ["vim.b", "vim.c"], 3),
    skill("vim.a"),
    skill("vim.b", ["vim.a"], 2),
    skill("vim.c", ["vim.a"], 2),
  ];

  it("puts every prerequisite in a column to the left of its dependents", () => {
    const graph = layoutSkillGraph(skills);
    const column = new Map(graph.nodes.map((node) => [node.slug, node.column]));
    expect(column.get("vim.a")).toBe(0);
    expect(column.get("vim.b")).toBe(1);
    expect(column.get("vim.c")).toBe(1);
    expect(column.get("vim.d")).toBe(2);
    for (const edge of graph.edges) {
      expect(column.get(edge.from) ?? Infinity).toBeLessThan(column.get(edge.to) ?? -Infinity);
    }
    expect(graph.columns).toBe(3);
    expect(graph.rows).toBe(2);
  });

  it("is stable: the same skills in any order give the same layout", () => {
    expect(layoutSkillGraph([...skills].reverse())).toEqual(layoutSkillGraph(skills));
  });

  it("orders a column by tier, then slug, and gives each skill its own row", () => {
    const rows = layoutSkillGraph(skills).nodes.filter((node) => node.column === 1);
    expect(rows.map((node) => [node.slug, node.row])).toEqual([
      ["vim.b", 0],
      ["vim.c", 1],
    ]);
  });

  it("uses the longest chain, not the shortest, for a skill with uneven prerequisites", () => {
    const uneven = [skill("vim.a"), skill("vim.b", ["vim.a"]), skill("vim.c", ["vim.a", "vim.b"])];
    expect(layoutSkillGraph(uneven).nodes.find((node) => node.slug === "vim.c")?.column).toBe(2);
  });

  it("leaves out disabled skills and ignores prerequisites that do not exist", () => {
    const graph = layoutSkillGraph([
      skill("vim.off", [], 1, false),
      skill("vim.a", ["vim.off", "vim.missing"]),
    ]);
    expect(graph.nodes.map((node) => node.slug)).toEqual(["vim.a"]);
    expect(graph.edges).toEqual([]);
    expect(graph.nodes[0]?.column).toBe(0);
  });

  it("does not loop on a cycle", () => {
    const graph = layoutSkillGraph([skill("vim.x", ["vim.y"]), skill("vim.y", ["vim.x"])]);
    expect(graph.nodes).toHaveLength(2);
  });

  it("handles an empty catalog", () => {
    expect(layoutSkillGraph([])).toEqual({ nodes: [], edges: [], columns: 0, rows: 0 });
  });
});
