import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import "./globals.css";
import { registerSW } from "virtual:pwa-register";

let reloadingForServiceWorker = false;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForServiceWorker) return;
    reloadingForServiceWorker = true;
    window.location.reload();
  });

  // Remove the stale API cache created by the previous worker. The new
  // worker always lets API requests reach the network.
  if ("caches" in window) {
    void caches.delete("monolith-api");
  }
}

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    // Check immediately instead of waiting for the browser's periodic update.
    void registration?.update();
  },
  onOfflineReady() {
    console.log("App ready to work offline");
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
