import { useCloud } from "../cloud/CloudProvider";
import { useProfile } from "../profile/ProfileProvider";
import { parseRoute } from "../router";

type NavKey = "home" | "map" | "progress" | "settings";

const NAV: readonly { readonly key: NavKey; readonly href: string; readonly label: string }[] = [
  { key: "home", href: "#/", label: "Today" },
  { key: "map", href: "#/map", label: "Skill map" },
  { key: "progress", href: "#/progress", label: "Progress" },
  { key: "settings", href: "#/settings", label: "Settings" },
];

/** Which nav entry the current screen belongs to (a skill's page belongs to the map). */
function currentKey(): NavKey | null {
  const route = parseRoute(window.location.search, window.location.hash);
  switch (route.name) {
    case "home":
      return "home";
    case "map":
    case "skill":
      return "map";
    case "progress":
      return "progress";
    case "settings":
      return "settings";
    default:
      return null;
  }
}

/** Brand, navigation and XP, shared by every screen outside practice (which stays distraction-free). */
export function AppHeader({ width = "max-w-[1200px]" }: { readonly width?: string }) {
  const { profile } = useProfile();
  const cloud = useCloud();
  const active = currentKey();
  const link = (current: boolean) =>
    `rounded-lg px-3.5 py-2.5 text-base font-semibold no-underline ${
      current ? "bg-raised text-ink" : "text-ink-2 hover:text-ink"
    }`;

  return (
    <header className="border-b border-line-faint">
      <div
        className={`mx-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-8 py-3.5 ${width}`}
      >
        <a href="#/" className="flex items-center gap-3 text-ink no-underline">
          <span aria-hidden className="h-6 w-3 rounded-[2px] bg-amber" />
          <span className="text-[19px] font-bold tracking-[-0.01em]">Tutor NeoVim</span>
        </a>
        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {NAV.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className={link(active === item.key)}
              {...(active === item.key ? { "aria-current": "page" as const } : {})}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span
            data-testid="header-xp"
            className="rounded-md border border-line px-2.5 py-1.5 font-mono text-sm text-ink-2"
          >
            {profile.gamification.xp} XP
          </span>
          {cloud.enabled ? (
            <a
              href="#/account"
              className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-raised px-4 text-[15px] font-bold text-ink no-underline hover:bg-line"
            >
              {cloud.user ? "Account" : "Sign in"}
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
