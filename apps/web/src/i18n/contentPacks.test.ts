import { describe, expect, it } from "vitest";
import { contentFor, contentReady } from "../exercises";
import { loadContentFor } from "./contentPacks";

/** The one skill whose title differs in every language, used as the visible proof. */
const SLUG = "vim.operator.change";

describe("content packs (T-902)", () => {
  it("holds the source language, so the first paint never waits for a chunk", () => {
    expect(contentReady("en")).toBe(true);
    expect(contentFor("en").findSkill(SLUG)?.title).toBe("Change");
  });

  it("reads the source language until the chosen pack arrives, then the translated content", async () => {
    // No pack yet: English exercise text rather than nothing.
    expect(contentReady("es")).toBe(false);
    expect(contentFor("es")).toBe(contentFor("en"));

    const fetched = await loadContentFor("es");
    expect(contentReady("es")).toBe(true);
    expect(contentFor("es")).toBe(fetched);
    expect(fetched.findSkill(SLUG)?.title).toBe("Cambiar");
    // Same shape as the source: a pack is a translation, never a different curriculum.
    expect(fetched.skills.map((skill) => skill.id)).toEqual(
      contentFor("en").skills.map((skill) => skill.id),
    );

    // Already built: the same content, not a second fetch.
    expect(await loadContentFor("es")).toBe(fetched);
  });
});
