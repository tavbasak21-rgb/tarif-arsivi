/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  base: "/tarif-arsivi/",
  test: {
    environment: "jsdom",
  },
});
