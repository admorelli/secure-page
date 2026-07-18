import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites from /<repo>/ — Vite must emit assets
  // (and the manifest + service worker) under this subpath or they 404.
  base: "/secure-page/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Secure Page",
        short_name: "SecurePage",
        description:
          "Offline-encrypted local vault for security data (cards, logins, secrets).",
        theme_color: "#0b0f1a",
        background_color: "#0b0f1a",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        scope: ".",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Take control immediately and purge stale cached shells so devices
        // hit with an old service worker pick up new deploys without manual
        // cache clearing.
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
