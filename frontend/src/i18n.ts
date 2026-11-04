import i18n from "i18next";
import { initReactI18next } from "react-i18next";

void i18n.use(initReactI18next).init({
  lng: "tr",
  fallbackLng: "tr",
  interpolation: { escapeValue: false },
  resources: {
    tr: {
      translation: {
        appName: "Blackrose Nakliye",
        home: {
          title: "Sistem durumu",
          apiOk: "API bağlantısı çalışıyor.",
          loading: "API kontrol ediliyor…",
        },
        notFound: { title: "Sayfa bulunamadı", description: "Aradığınız sayfa mevcut değil." },
        error: { title: "Bir sorun oluştu", traceId: "Hata kodu: {{traceId}}" },
      },
    },
  },
});

export default i18n;
