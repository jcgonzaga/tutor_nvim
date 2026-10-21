import { describe, expect, it } from "vitest";
import { parseRoute, routeHash, type Route } from "./router";

describe("router", () => {
  it("opens home by default", () => {
    expect(parseRoute("", "")).toEqual({ name: "home" });
    expect(parseRoute("", "#/")).toEqual({ name: "home" });
    expect(parseRoute("", "#/nonsense")).toEqual({ name: "home" });
  });

  it("parses the screens", () => {
    expect(parseRoute("", "#/onboarding")).toEqual({ name: "onboarding" });
    expect(parseRoute("", "#/session")).toEqual({ name: "session" });
    expect(parseRoute("", "#/map")).toEqual({ name: "map" });
    expect(parseRoute("", "#/progress")).toEqual({ name: "progress" });
    expect(parseRoute("", "#/account")).toEqual({ name: "account" });
  });

  it("keeps free practice on ?exercise=, ahead of the hash", () => {
    expect(parseRoute("?exercise=vim-x-001", "#/map")).toEqual({
      name: "practice",
      slug: "vim-x-001",
    });
  });

  it("reads a skill slug and falls back to the map without one", () => {
    expect(parseRoute("", "#/skill/vim.navigation.words")).toEqual({
      name: "skill",
      slug: "vim.navigation.words",
    });
    expect(parseRoute("", "#/skill/")).toEqual({ name: "map" });
  });

  it("round-trips every route through its hash", () => {
    const routes: Route[] = [
      { name: "home" },
      { name: "onboarding" },
      { name: "session" },
      { name: "map" },
      { name: "progress" },
      { name: "account" },
      { name: "skill", slug: "vim.textobject.inner-quotes" },
    ];
    for (const route of routes) {
      expect(parseRoute("", routeHash(route))).toEqual(route);
    }
  });

  it("builds a free-practice link as a query", () => {
    expect(routeHash({ name: "practice", slug: "a b" })).toBe("?exercise=a%20b");
  });
});
