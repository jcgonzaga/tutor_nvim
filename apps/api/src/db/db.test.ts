import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, sql } from "drizzle-orm";
import { loadContentBundle } from "../content";
import type { DbHandle } from "./client";
import { openTestDb } from "../test-util";
import { exerciseSkills, exercises, skillPrerequisites, skills } from "./schema";
import { syncContent } from "./syncContent";

const bundle = loadContentBundle();
let handle: DbHandle;

beforeAll(async () => {
  handle = await openTestDb();
});
afterAll(async () => handle.close());

describe("database migrations and content mirror (T-601)", () => {
  it("applies every migration to an empty Postgres", async () => {
    const tables = await handle.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = (tables as unknown as { rows: { table_name: string }[] }).rows.map(
      (row) => row.table_name,
    );
    for (const expected of [
      "users",
      "user_settings",
      "skills",
      "skill_prerequisites",
      "exercises",
      "exercise_skills",
      "user_skills",
      "attempts",
      "attempt_events",
      "sessions",
      "session_exercises",
      "review_queue",
    ]) {
      expect(names, expected).toContain(expected);
    }
  });

  it("mirrors the content, and mirroring twice changes nothing", async () => {
    await syncContent(handle.db, bundle);
    const first = await handle.db.select({ n: count() }).from(exercises);
    await syncContent(handle.db, bundle);
    const second = await handle.db.select({ n: count() }).from(exercises);

    expect(first[0]?.n).toBe(bundle.exercises.length);
    expect(second).toEqual(first);
    expect((await handle.db.select({ n: count() }).from(skills))[0]?.n).toBe(bundle.skills.length);
    expect((await handle.db.select({ n: count() }).from(skillPrerequisites))[0]?.n).toBe(
      bundle.skills.reduce((sum, skill) => sum + skill.prerequisites.length, 0),
    );
    expect((await handle.db.select({ n: count() }).from(exerciseSkills))[0]?.n).toBe(
      bundle.exercises.reduce((sum, exercise) => sum + exercise.skillIds.length, 0),
    );
  });
});
