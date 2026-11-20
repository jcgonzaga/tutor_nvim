import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AnalyticsProvider } from "./analytics/AnalyticsProvider";
import { App } from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import { catalogFor } from "./i18n/catalogs";
import { PrefsProvider } from "./prefs/PrefsProvider";
import { loadPrefs } from "./prefs/prefs";
import { ErrorBoundary } from "./monitoring/ErrorBoundary";
import {
  createErrorReporter,
  httpSender,
  installGlobalErrorHandlers,
} from "./monitoring/errorReporter";
import { parseRoute } from "./router";
import { CloudProvider } from "./cloud/CloudProvider";
import { readCloudConfig } from "./cloud/config";
import { loadAuthClient } from "./cloud/loadAuth";
import { ProfileProvider } from "./profile/ProfileProvider";
import { browserStorage } from "./storage/browserStorage";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const storage = browserStorage();

// Error reporting (T-906): to the API when one is configured, otherwise only to the console.
const errorUrl =
  import.meta.env.VITE_ERROR_URL ??
  (import.meta.env.VITE_API_URL
    ? `${String(import.meta.env.VITE_API_URL).replace(/\/$/, "")}/api/client-errors`
    : null);
const reporter = createErrorReporter({
  send: (report) => {
    console.error("[error]", report.message);
    if (errorUrl) httpSender(errorUrl)(report);
  },
  build: import.meta.env.VITE_BUILD_ID ?? import.meta.env.MODE,
  route: () => parseRoute(window.location.search, window.location.hash).name,
});
installGlobalErrorHandlers(reporter);
const cloudConfig = readCloudConfig(import.meta.env);

// The crash screen is above the providers, so it gets its text here: the stored language if its
// pack is already in memory, the source language otherwise (T-902).
const errorMessages = catalogFor(loadPrefs(storage).language).app;

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary reporter={reporter} messages={errorMessages}>
      <PrefsProvider storage={storage}>
        <I18nProvider>
          <AnalyticsProvider
            url={import.meta.env.VITE_ANALYTICS_URL ?? null}
            build={import.meta.env.VITE_BUILD_ID ?? import.meta.env.MODE}
          >
            <ProfileProvider storage={storage}>
              <CloudProvider config={cloudConfig} storage={storage} loadAuth={loadAuthClient}>
                <App />
              </CloudProvider>
            </ProfileProvider>
          </AnalyticsProvider>
        </I18nProvider>
      </PrefsProvider>
    </ErrorBoundary>
  </StrictMode>,
);
