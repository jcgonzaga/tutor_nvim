import { useCloud } from "../cloud/CloudProvider";
import { useT } from "../i18n/I18nProvider";
import { useProfile } from "../profile/ProfileProvider";
import { parseRoute } from "../router";

type NavKey = "home" | "map" | "progress" | "settings";

const NAV: readonly { readonly key: NavKey; readonly href: string }[] = [
  { key: "home", href: "#/" },
  { key: "map", href: "#/map" },
  { key: "progress", href: "#/progress" },
  { key: "settings", href: "#/settings" },
];

/** The nav entries are labelled in the catalog (`app.header`), in the same keys. */
const LABEL_KEYS = {
  home: "today",
  map: "map",
  progress: "progress",
  settings: "settings",
} as const satisfies Record<NavKey, string>;

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
  const t = useT();
  const words = t.app.header;
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
          <span className="text-[19px] font-bold tracking-[-0.01em]">{t.common.appName}</span>
        </a>
        <nav aria-label={words.navLabel} className="flex flex-wrap gap-1">
          {NAV.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className={link(active === item.key)}
              {...(active === item.key ? { "aria-current": "page" as const } : {})}
            >
              {words[LABEL_KEYS[item.key]]}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span
            data-testid="header-xp"
            className="rounded-md border border-line px-2.5 py-1.5 font-mono text-sm text-ink-2"
          >
            {words.xp(profile.gamification.xp)}
          </span>
          {cloud.enabled ? (
            <a
              href="#/account"
              className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-raised px-4 text-[15px] font-bold text-ink no-underline hover:bg-line"
            >
              {cloud.user ? words.account : words.signIn}
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
