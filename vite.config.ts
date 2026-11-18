/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const BASE = "/tarif-arsivi/";
const THEME_COLOR = "#c2410c";

export default defineConfig({
  base: BASE,
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      // Kayıt betiği index.html'e otomatik eklenir; src/main.ts'ye dokunmak gerekmez.
      injectRegister: "auto",
      // Simgeler zaten globPatterns ile önbellekte; listede ikinci kez yer almasınlar.
      includeManifestIcons: false,
      manifest: {
        name: "Tarif Arşivi",
        short_name: "Tarifler",
        description: "Ekran kayıtlarından ve fotoğraflardan tarif arşivi",
        lang: "tr",
        dir: "ltr",
        display: "standalone",
        start_url: BASE,
        scope: BASE,
        theme_color: THEME_COLOR,
        background_color: "#fff7ed",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Uygulama dosyaları çevrimdışı açılış için önbellekte.
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        navigateFallback: "index.html",
        // Claude API çağrıları başka bir köke (api.anthropic.com) gider; service worker yalnız
        // aynı kökteki gezinmeleri yanıtlar ve runtimeCaching kuralı yoktur, yani API yanıtları
        // hiçbir zaman önbelleğe alınmaz.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: "jsdom",
  },
});
