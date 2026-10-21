import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePrefs } from "../prefs/PrefsProvider";
import { createAnalytics, httpAnalyticsSender, type Analytics } from "./analytics";

const NOTHING: Analytics = { track: () => undefined, flush: () => undefined };
const AnalyticsContext = createContext<Analytics>(NOTHING);
export const useAnalytics = (): Analytics => useContext(AnalyticsContext);

/**
 * Wires analytics to the preferences. With no `url` configured it is inert: no timers, no
 * listeners, no network. With one, events are batched, sent every few seconds and when the page is
 * hidden, and only while the learner has allowed it.
 */
export function AnalyticsProvider({
  url,
  build,
  children,
}: {
  readonly url: string | null;
  readonly build?: string;
  readonly children: ReactNode;
}) {
  const { prefs } = usePrefs();
  // The sender reads the preferences when it sends, not when it was created, so a learner who turns
  // analytics off stops the next batch without the sender being rebuilt.
  const [latest] = useState(() => {
    let current = prefs;
    return { get: () => current, set: (next: typeof prefs) => void (current = next) };
  });
  useEffect(() => {
    latest.set(prefs);
  });

  const analytics = useMemo(
    () =>
      url === null
        ? NOTHING
        : createAnalytics({
            send: httpAnalyticsSender(url),
            enabled: () => latest.get().analytics,
            installId: () => latest.get().installId,
            ...(build ? { build } : {}),
          }),
    [url, build, latest],
  );

  useEffect(() => {
    if (url === null) return;
    const interval = setInterval(analytics.flush, 10_000);
    const onHidden = () => {
      if (document.visibilityState === "hidden") analytics.flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", analytics.flush);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", analytics.flush);
      analytics.flush();
    };
  }, [url, analytics]);

  return <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>;
}
