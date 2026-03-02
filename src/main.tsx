import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

const isLovablePreview = window.location.hostname.includes("id-preview--");

if (isLovablePreview && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });

  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        void caches.delete(key);
      });
    });
  }
} else if ("serviceWorker" in navigator) {
  // Keep mobile/PWA installs up to date with latest deployment
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

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
}

createRoot(document.getElementById("root")!).render(<App />);
