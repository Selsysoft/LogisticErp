// "ztoFinans" ad alanı: ZTO görünümlü finans ekranlarının metinleri. Kullanım:
// const { t } = useTranslation("ztoFinans"); t("table.search")
import branch from "./branch";
import common from "./common";
import exportTexts from "./export";
import modal from "./modal";
import nav from "./nav";
import pages from "./pages";
import select from "./select";
import table from "./table";

export default {
  common,
  nav,
  table,
  select,
  modal,
  branch,
  export: exportTexts,
  pages,
} as const;
