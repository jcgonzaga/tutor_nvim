import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CloudProvider } from "./cloud/CloudProvider";
import { readCloudConfig } from "./cloud/config";
import { loadAuthClient } from "./cloud/loadAuth";
import { ProfileProvider } from "./profile/ProfileProvider";
import { browserStorage } from "./storage/browserStorage";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const storage = browserStorage();
const cloudConfig = readCloudConfig(import.meta.env);

createRoot(root).render(
  <StrictMode>
    <ProfileProvider storage={storage}>
      <CloudProvider config={cloudConfig} storage={storage} loadAuth={loadAuthClient}>
        <App />
      </CloudProvider>
    </ProfileProvider>
  </StrictMode>,
);
