import { useCallback, useEffect, useState } from "react";

/**
 * The app's screens. Progression is data (the skill graph), not routes: the only skill-specific
 * route is the detail page, which takes the slug from content.
 *
 * `?exercise=<slug>` opens free practice on one exercise (no profile, no scheduling); it wins over
 * the hash so existing links and the practice E2E keep working.
 */
export type Route =
  | { readonly name: "home" }
  | { readonly name: "onboarding" }
  | { readonly name: "session" }
  | { readonly name: "map" }
  | { readonly name: "skill"; readonly slug: string }
  | { readonly name: "progress" }
  | { readonly name: "account" }
  | { readonly name: "practice"; readonly slug: string };

export function parseRoute(search: string, hash: string): Route {
  const exercise = new URLSearchParams(search).get("exercise");
  if (exercise) return { name: "practice", slug: exercise };

  const [head = "", ...rest] = hash.replace(/^#\/?/, "").split("/");
  switch (head) {
    case "onboarding":
      return { name: "onboarding" };
    case "session":
      return { name: "session" };
    case "map":
      return { name: "map" };
    case "progress":
      return { name: "progress" };
    case "account":
      return { name: "account" };
    case "skill": {
      const slug = decodeURIComponent(rest.join("/"));
      return slug ? { name: "skill", slug } : { name: "map" };
    }
    default:
      return { name: "home" };
  }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "skill":
      return `#/skill/${encodeURIComponent(route.slug)}`;
    case "practice":
      return `?exercise=${encodeURIComponent(route.slug)}`;
    default:
      return `#/${route.name}`;
  }
}

const currentRoute = (): Route => parseRoute(window.location.search, window.location.hash);

export type Navigate = (route: Route, options?: { readonly replace?: boolean }) => void;

export function useRoute(): { route: Route; navigate: Navigate } {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);

  const navigate = useCallback<Navigate>((next, options) => {
    if (next.name === "practice") {
      window.location.assign(routeHash(next));
      return;
    }
    // Leaving free practice drops `?exercise=` so the hash route applies again.
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = routeHash(next);
    if (options?.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setRoute(next);
  }, []);

  return { route, navigate };
}
