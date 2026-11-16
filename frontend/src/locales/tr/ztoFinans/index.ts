// "ztoFinans" ad alanı: ZTO görünümlü finans ekranlarının metinleri. Kullanım:
// const { t } = useTranslation("ztoFinans"); t("table.search")
import accounts from "./accounts";
import allTransactions from "./allTransactions";
import bills from "./bills";
import branch from "./branch";
import balanceSheet from "./balanceSheet";
import branchGroups from "./branchGroups";
import cashFlow from "./cashFlow";
import checkBooks from "./checkBooks";
import checkDocuments from "./checkDocuments";
import checks from "./checks";
import collections from "./collections";
import common from "./common";
import companies from "./companies";
import currencies from "./currencies";
import customerAccountReport from "./customerAccountReport";
import dailyReport from "./dailyReport";
import definitions from "./definitions";
import editInstrument from "./editInstrument";
import expenseItems from "./expenseItems";
import expenses from "./expenses";
import exportTexts from "./export";
import financeReport from "./financeReport";
import funds from "./funds";
import fundTransactions from "./fundTransactions";
import fxReport from "./fxReport";
import instruments from "./instruments";
import modal from "./modal";
import nav from "./nav";
import pages from "./pages";
import payments from "./payments";
import quickCari from "./quickCari";
import salesTruckExpenses from "./salesTruckExpenses";
import select from "./select";
import settlementModals from "./settlementModals";
import table from "./table";
import transactions from "./transactions";
import transferCenter from "./transferCenter";
import treasury from "./treasury";
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
  // 12.3 ekranları (§5.11): `instruments` ortak (FE-0); checks FE-1; bills, checkBooks,
  // editInstrument, checkDocuments FE-2.
  instruments,
  checks,
  bills,
  checkBooks,
  editInstrument,
  checkDocuments,
  // 12.7 ekranları (§5.9): FE-0 iskelet; expenseItems ve expenses FE-1/FE-2, salesTruckExpenses FE-3.
  expenseItems,
  expenses,
  salesTruckExpenses,
  // 12.8 ekranları (§5.1): FE-0 iskelet; customerAccountReport ve currencies FE-1, financeReport ve
  // balanceSheet FE-2, fxReport, cashFlow ve treasury FE-3.
  customerAccountReport,
  financeReport,
  balanceSheet,
  fxReport,
  cashFlow,
  currencies,
  treasury,
} as const;
