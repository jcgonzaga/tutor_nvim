import { AccountScreen } from "./cloud/AccountScreen";
import { FreePractice } from "./FreePractice";
import { HomeScreen } from "./home/HomeScreen";
import { SkillDetailScreen } from "./map/SkillDetailScreen";
import { SkillMapScreen } from "./map/SkillMapScreen";
import { NoticeBanner } from "./NoticeBanner";
import { OnboardingScreen } from "./onboarding/OnboardingScreen";
import { ProgressScreen } from "./progress/ProgressScreen";
import { useProfile } from "./profile/ProfileProvider";
import { useEffect } from "react";
import { useRoute, type Navigate, type Route } from "./router";
import { SettingsScreen } from "./prefs/SettingsScreen";
import { SessionScreen } from "./session/SessionScreen";

export function App() {
  const { route, navigate } = useRoute();
  // Free practice needs no profile: it is a single exercise, not part of the learner's progress.
  if (route.name === "practice") return <FreePractice slug={route.slug} />;

  return (
    <>
      <NoticeBanner />
      <Screen route={route} navigate={navigate} />
    </>
  );
}

function Screen({ route, navigate }: { readonly route: Route; readonly navigate: Navigate }) {
  const { profile } = useProfile();
  const needsOnboarding = !profile.onboarding.completed;

  // Everything but free practice starts with onboarding, once. The flow lives on its own route,
  // so it stays on screen (to show the estimate) after the profile counts as onboarded.
  useEffect(() => {
    if (needsOnboarding && route.name !== "onboarding" && route.name !== "account") {
      navigate({ name: "onboarding" }, { replace: true });
    }
  }, [needsOnboarding, route.name, navigate]);

  // Signing in is allowed before onboarding: on a new device it brings the finished onboarding along.
  if (route.name === "account") return <AccountScreen />;
  if (needsOnboarding || route.name === "onboarding") {
    return <OnboardingScreen navigate={navigate} />;
  }
  switch (route.name) {
    case "session":
      return <SessionScreen navigate={navigate} />;
    case "map":
      return <SkillMapScreen />;
    case "skill":
      return <SkillDetailScreen slug={route.slug} />;
    case "progress":
      return <ProgressScreen />;
    case "settings":
      return <SettingsScreen analyticsAvailable={Boolean(import.meta.env.VITE_ANALYTICS_URL)} />;
    default:
      return <HomeScreen navigate={navigate} />;
  }
}
