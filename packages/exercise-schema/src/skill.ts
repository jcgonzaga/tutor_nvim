import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { difficultySchema, idSchema, lessonCardSchema, slugSchema, tagSchema } from "./primitives";
import { ExerciseValidationError, formatIssues } from "./validate";

/** Version of the skill content format. Bump with an explicit migration. */
export const SKILL_SCHEMA_VERSION = 1;

export const SKILL_DOMAINS = ["linux", "vim", "neovim", "lazyvim"] as const;

/**
 * A skill is the unit of learning (AGENTS.md 2.1). Prerequisites, tier and
 * difficulty are data, so progression never lives in UI routes.
 */
export const skillSchema = z.strictObject({
  schemaVersion: z.literal(SKILL_SCHEMA_VERSION),
  id: idSchema,
  slug: slugSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  domain: z.enum(SKILL_DOMAINS),
  tier: z.number().int().min(1).max(10),
  /** Slugs of the skills that must be learned first. */
  prerequisites: z.array(slugSchema).default([]),
  concepts: z.array(z.string().min(1)).default([]),
  tags: z.array(tagSchema).default([]),
  difficulty: difficultySchema,
  /** Theory shown once before the skill's first exercise (1-4 cards). Content tests require it. */
  lesson: z.array(lessonCardSchema).max(4).default([]),
  enabled: z.boolean().default(true),
});

export type Skill = z.output<typeof skillSchema>;
export type SkillInput = z.input<typeof skillSchema>;

/** Validates one skill. Throws `ExerciseValidationError`-style errors with the offending paths. */
export function parseSkill(input: unknown, source?: string): Skill {
  const result = skillSchema.safeParse(input);
  if (!result.success) throw new ExerciseValidationError(formatIssues(result.error), source);
  return result.data;
}

export function parseSkillYaml(text: string, source?: string): Skill {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (error) {
    throw new ExerciseValidationError(
      [`YAML syntax error: ${error instanceof Error ? error.message : String(error)}`],
      source,
    );
  }
  return parseSkill(data, source);
}
