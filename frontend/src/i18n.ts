import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import tr from "./locales/tr";

// Metinler src/locales/tr/ altında ad alanlarına bölünür: "translation" (varsayılan, mevcut ekranlar)
// ve "ztoFinans" (ZTO görünümlü finans ekranları; useTranslation("ztoFinans")).
void i18n.use(initReactI18next).init({
  lng: "tr",
  fallbackLng: "tr",
  ns: ["translation", "ztoFinans"],
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  resources: { tr },
});

export default i18n;
