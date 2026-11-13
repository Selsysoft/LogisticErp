/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { ztoScopePlugin } from "./src/zto/styles/prefixTransform.ts";
import { ztoLicensePlugin } from "./src/zto/styles/thirdPartyNotice.ts";

export default defineConfig({
  // ztoLicensePlugin: küçültücü lisans yorumlarını sildiği için ZTO CSS paketine bildirim derleme sonunda eklenir.
  plugins: [react(), ztoLicensePlugin()],
  server: {
    proxy: { "/api": "http://localhost:8080" },
  },
  css: {
    postcss: {
      // ZTO Finans CSS'i (src/zto/styles, içe aktardığı vendor ve Font Awesome dahil) .zto-finans altına
      // alınır; diğer CSS'e (fontsource) dokunulmaz. @layer kullanılmaz: gerekçe prefixTransform.ts'te.
      plugins: [ztoScopePlugin()],
    },
  },
  // Uçtan uca testler (e2e/) Playwright ile ayrıca çalışır.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Ekranlar (.tsx) uçtan uca testlerle sınanır; birim kapsamı ekrandan bağımsız mantığı ölçer:
    // API istemcisi, oturum, çevrimdışı sürücü kuyruğu, durum kuralları, biçimlendirme.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.tsx",
        "src/**/*.test.ts",
        "src/**/types.ts",
        "src/i18n.ts",
        "src/theme.ts",
        "src/locales/**",
      ],
      reporter: ["text-summary", "json-summary", "html"],
      // 2026-11-10 ölçümü: satır %79, dal %90. Eksikler çoğunlukla React Query sarmalayıcıları ve
      // tarayıcıya özgü IndexedDB/fotoğraf küçültme kodu.
      thresholds: { lines: 75, branches: 85 },
    },
  },
});
