// Yazı tipleri paketle gelir: dış sunucuya istek gitmez, CSP yalnız kendi alan adına izin verir.
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./i18n";
import { theme } from "./theme";

const queryClient = new QueryClient();

// Yeni sürüm yayımlanınca eski sayfa dosyaları sunucudan kalkar; açık sekme bir sayfayı ilk kez
// açarken yükleme başarısız olursa sayfa yeni sürümle yeniden yüklenir. Döngüye girmemesi için
// bir dakikada en çok bir kez.
window.addEventListener("vite:preloadError", (event) => {
  const key = "blackrose.reloadedAt";
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60_000) {
      return;
    }
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // Depolama kapalıysa da bir kez yenilenir.
  }
  event.preventDefault();
  window.location.reload();
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
