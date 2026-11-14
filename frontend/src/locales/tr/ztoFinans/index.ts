// "ztoFinans" ad alanı: ZTO görünümlü finans ekranlarının metinleri. Kullanım:
// const { t } = useTranslation("ztoFinans"); t("table.search")
import branch from "./branch";
import branchGroups from "./branchGroups";
import common from "./common";
import companies from "./companies";
import definitions from "./definitions";
import exportTexts from "./export";
import modal from "./modal";
import nav from "./nav";
import pages from "./pages";
import select from "./select";
import table from "./table";
import workPlaces from "./workPlaces";

export default {
  common,
  nav,
  table,
  select,
  modal,
  branch,
  export: exportTexts,
  pages,
  definitions,
  workPlaces,
  branchGroups,
  companies,
} as const;
