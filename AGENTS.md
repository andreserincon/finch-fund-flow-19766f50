# Project rules

- PWA is manifest-only (no offline/app-shell service worker); `public/sw.js` is a kill-switch that evicts old installs. Why: cached app shells repeatedly caused blank screens on installed phones after deploys.
