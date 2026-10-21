import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ProfileProvider } from "./profile/ProfileProvider";
import { browserStorage } from "./storage/browserStorage";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <ProfileProvider storage={browserStorage()}>
      <App />
    </ProfileProvider>
  </StrictMode>,
);
