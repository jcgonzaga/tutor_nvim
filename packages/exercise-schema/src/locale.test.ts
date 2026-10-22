import { describe, expect, it } from "vitest";
import {
  localizeBundle,
  parseSkillYaml,
  validateContent,
  validateLocale,
  type ContentBundle,
  type ContentSource,
} from "./index";

const skillYaml = [
  "schemaVersion: 1",
  "id: vim-demo",
  "slug: vim.demo",
  "title: Demo",
  "description: A demo skill.",
  "domain: vim",
  "tier: 1",
  "difficulty: 1",
  "lesson:",
  "  - title: Change",
  "    body: c means change.",
  '    keys: "ci\\""',
  "  - title: Inside",
  "    body: i means inside.",
].join("\n");

const exerciseYaml = [
  "schemaVersion: 1",
  "id: vim-demo-001",
  "slug: vim.demo.001",
  "title: Delete a letter",
  "instruction: Delete the first letter.",
  "skillIds:",
  "  - vim.demo",
  "mode: recall",
  "difficulty: 1",
  "initialState:",
  "  buffer: |",
  "    abc",
  "objective:",
  "  type: buffer_equals",
  "  target: |",
  "    bc",
  "evaluation:",
  "  requireFinalNormalMode: false",
  "solutions:",
  "  - sequence: x",
  "    classification: optimal",
  "hints:",
  "  - afterMs: 1000",
  "    level: 1",
  "    text: Use x.",
  "explanation: x deletes the character under the cursor.",
].join("\n");

const bundle = (): ContentBundle => {
  const { bundle: loaded, errors } = validateContent({
    skills: [{ path: "skills/vim.demo.yaml", text: skillYaml }],
    exercises: [{ path: "exercises/vim-demo-001.yaml", text: exerciseYaml }],
  });
  if (!loaded) throw new Error(errors.join("\n"));
  return loaded;
};

const src = (path: string, text: string): ContentSource => ({ path, text });

const skillEs = [
  "id: vim-demo",
  "title: Demostración",
  "description: Una skill de ejemplo.",
  "lesson:",
  "  - title: Cambiar",
  "    body: c significa cambiar.",
  "  - title: Dentro",
  "    body: i significa dentro.",
].join("\n");

const exerciseEs = [
  "id: vim-demo-001",
  "title: Borra una letra",
  "instruction: Borra la primera letra.",
  "hints:",
  "  - Usa x.",
  "explanation: x borra el carácter bajo el cursor.",
].join("\n");

const input = (skill = skillEs, exercise = exerciseEs) => ({
  skills: [src("locales/es/skills/vim.demo.yaml", skill)],
  exercises: [src("locales/es/exercises/vim-demo-001.yaml", exercise)],
});

describe("lesson and explanation in the source content", () => {
  it("a skill carries up to 4 lesson cards, each with an optional key sequence", () => {
    const skill = parseSkillYaml(skillYaml);
    expect(skill.lesson).toHaveLength(2);
    expect(skill.lesson[0]?.keys).toBe('ci"');
    const five = skillYaml.replace("lesson:", "lesson:\n" + "  - {title: a, body: b}\n".repeat(3));
    expect(() => parseSkillYaml(five)).toThrow(/lesson/);
  });

  it("is optional in the schema, so content written before it still loads", () => {
    const { lesson } = parseSkillYaml(skillYaml.split("lesson:")[0] ?? "");
    expect(lesson).toEqual([]);
  });
});

describe("validateLocale", () => {
  it("accepts a complete translation", () => {
    const { texts, errors } = validateLocale("es", bundle(), input());
    expect(errors).toEqual([]);
    expect(texts?.skills.get("vim-demo")?.title).toBe("Demostración");
  });

  it("reports a skill or exercise with no translation", () => {
    const { errors } = validateLocale("es", bundle(), { skills: [], exercises: [] });
    expect(errors.join("\n")).toContain('skill "vim.demo" (vim-demo) has no translation');
    expect(errors.join("\n")).toContain(
      'exercise "vim.demo.001" (vim-demo-001) has no translation',
    );
  });

  it("reports a translation of something that does not exist", () => {
    const stray = exerciseEs.replace("vim-demo-001", "vim-gone-001");
    const { errors } = validateLocale("es", bundle(), input(skillEs, stray));
    expect(errors.join("\n")).toContain('unknown exercise id "vim-gone-001"');
  });

  it("requires the same number of hints and lesson cards as the source", () => {
    const noHint = exerciseEs.replace("hints:\n  - Usa x.\n", "");
    const oneCard = skillEs.replace("  - title: Dentro\n    body: i significa dentro.", "");
    const { errors } = validateLocale("es", bundle(), input(oneCard, noHint));
    expect(errors.join("\n")).toContain("1 lesson cards, the source has 2");
    expect(errors.join("\n")).toContain("0 hints, the source has 1");
  });

  it("requires the translation of an explanation the source has", () => {
    const { errors } = validateLocale(
      "es",
      bundle(),
      input(skillEs, exerciseEs.replace(/explanation:.*/, "")),
    );
    expect(errors.join("\n")).toContain("has an explanation but no translation");
  });

  it("rejects unknown fields and bad YAML, naming the file", () => {
    const { errors } = validateLocale("es", bundle(), input(`${skillEs}\nbogus: 1`, "id: [oops"));
    expect(errors.join("\n")).toContain("locales/es/skills/vim.demo.yaml is invalid");
    expect(errors.join("\n")).toContain(
      "locales/es/exercises/vim-demo-001.yaml: YAML syntax error",
    );
  });
});

describe("localizeBundle", () => {
  it("replaces only the text, keeping ids, solutions and key sequences", () => {
    const base = bundle();
    const { texts } = validateLocale("es", base, input());
    const es = localizeBundle(base, texts!);
    const skill = es.skills[0]!;
    const exercise = es.exercises[0]!;
    expect(skill).toMatchObject({ id: "vim-demo", slug: "vim.demo", title: "Demostración" });
    expect(skill.lesson[0]).toEqual({
      title: "Cambiar",
      body: "c significa cambiar.",
      keys: 'ci"',
    });
    expect(exercise).toMatchObject({
      id: "vim-demo-001",
      title: "Borra una letra",
      instruction: "Borra la primera letra.",
      explanation: "x borra el carácter bajo el cursor.",
    });
    expect(exercise.hints[0]).toEqual({ afterMs: 1000, level: 1, text: "Usa x." });
    expect(exercise.solutions).toEqual(base.exercises[0]!.solutions);
    expect(base.exercises[0]!.title).toBe("Delete a letter");
  });
});
