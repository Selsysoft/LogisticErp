/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8080" },
  },
  // Uçtan uca testler (e2e/) Playwright ile ayrıca çalışır.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Ekranlar (.tsx) uçtan uca testlerle sınanır; birim kapsamı ekrandan bağımsız mantığı ölçer:
    // API istemcisi, oturum, çevrimdışı sürücü kuyruğu, durum kuralları, biçimlendirme.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/types.ts", "src/i18n.ts", "src/theme.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      // 2026-11-10 ölçümü: satır %67, dal %71. Eksikler çoğunlukla React Query sarmalayıcıları ve
      // tarayıcıya özgü IndexedDB/fotoğraf küçültme kodu.
      thresholds: { lines: 65, branches: 68 },
    },
  },
});
