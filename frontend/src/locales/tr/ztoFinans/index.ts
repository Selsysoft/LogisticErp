// "ztoFinans" ad alanı: ZTO görünümlü finans ekranlarının metinleri. Kullanım:
// const { t } = useTranslation("ztoFinans"); t("table.search")
import accounts from "./accounts";
import allTransactions from "./allTransactions";
import branch from "./branch";
import branchGroups from "./branchGroups";
import collections from "./collections";
import common from "./common";
import companies from "./companies";
import dailyReport from "./dailyReport";
import definitions from "./definitions";
import exportTexts from "./export";
import funds from "./funds";
import fundTransactions from "./fundTransactions";
import modal from "./modal";
import nav from "./nav";
import pages from "./pages";
import payments from "./payments";
import quickCari from "./quickCari";
import select from "./select";
import settlementModals from "./settlementModals";
import table from "./table";
import transactions from "./transactions";
import transferCenter from "./transferCenter";
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
  // 12.1 ekranları (§5.14): parçalar sahiplerince (FE1/FE2/FE3) doldurulur.
  accounts,
  transactions,
  allTransactions,
  quickCari,
  // 12.2 ekranları (§5.15): parçalar sahiplerince (FE-1: funds, fundTransactions; FE-2:
  // transferCenter) doldurulur.
  funds,
  fundTransactions,
  transferCenter,
  // 12.2a ekranları (§5.15): parçalar sahiplerince (FE-1: payments, collections, dailyReport; FE-2:
  // settlementModals) doldurulur.
  payments,
  collections,
  settlementModals,
  dailyReport,
} as const;
