import { describe, expect, it } from "vitest";
import { catalogFor, catalogReady, loadCatalog } from "./catalogs";
import { en } from "./en";
import { es } from "./es";

describe("language packs (T-902)", () => {
  it("holds the source language, so the first paint never waits for a chunk", () => {
    expect(catalogReady("en")).toBe(true);
    expect(catalogFor("en")).toBe(en);
  });

  it("reads the source language until the chosen pack arrives, then the pack, fetched once", async () => {
    // No pack yet: the screen reads English rather than a raw key.
    expect(catalogReady("es")).toBe(false);
    expect(catalogFor("es")).toBe(en);

    const fetched = await loadCatalog("es");
    expect(fetched).toBe(es);
    expect(catalogReady("es")).toBe(true);
    expect(catalogFor("es")).toBe(es);

    // Already in memory: the same pack, not a second fetch.
    expect(await loadCatalog("es")).toBe(fetched);
  });
});
