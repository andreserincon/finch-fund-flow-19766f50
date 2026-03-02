import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Keep mobile/PWA installs up to date with latest deployment
if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const refreshRegistration = () => {
      if (document.visibilityState === "visible") {
        registration.update();
      }
    };

    registration.update();
    document.addEventListener("visibilitychange", refreshRegistration);
    window.setInterval(refreshRegistration, 60_000);
  },
});

createRoot(document.getElementById("root")!).render(<App />);
