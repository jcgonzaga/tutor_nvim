import type { FastifyInstance } from "fastify";
import type { SkillDto } from "@tutor-nvim/shared";
import type { RouteContext } from "../app";
import { HttpError } from "../errors";

export function registerSkillRoutes(api: FastifyInstance, { bundle }: RouteContext): void {
  const dtos: SkillDto[] = bundle.skills.map((skill) => ({
    id: skill.id,
    slug: skill.slug,
    title: skill.title,
    description: skill.description,
    domain: skill.domain,
    tier: skill.tier,
    difficulty: skill.difficulty,
    prerequisites: [...skill.prerequisites],
    enabled: skill.enabled,
  }));

  api.get("/api/skills", async () => ({ skills: dtos }));

  // `:id` is the skill's stable id; its slug works too, since both are public identifiers.
  api.get<{ Params: { id: string } }>("/api/skills/:id", async (request) => {
    const found = dtos.find(
      (skill) => skill.id === request.params.id || skill.slug === request.params.id,
    );
    if (!found) throw new HttpError(404, "not_found", "No such skill");
    return found;
  });
}
