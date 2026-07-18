import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.tsx";

// Register the service worker for offline / installable PWA (PoC).
// `onNeedRefresh` fires when a new SW is installed and waiting. We call the
// returned `updateSW(true)` to force it to skipWaiting and take control
// promptly (clientsClaim handles activation). Without this, a worker stuck in
// "waiting" never claims the page and the app stays non-offline / non-
// controlling until a manual reload.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // A new worker is waiting — force it to activate immediately.
    void updateSW(true);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
