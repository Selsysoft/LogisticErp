import {
  CSSProperties,
  FormEvent,
  Fragment,
  ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { useCurrencies } from "../../../../pages/finance/common";
import { useFundList } from "../../../../pages/finance/fundApi";
import { useDailyReport } from "../../../../pages/finance/settlementApi";
import type {
  DailyInstrumentMovement,
  PayMethod,
  SettlementType,
} from "../../../../pages/finance/types";
import { ZtoBranchMultiSelect, formatDate } from "../../../components";
import { currencySymbol, formatN2 } from "../../../format";
import { collectionsPath, paymentsPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import {
  CARD_LIMIT,
  CHUNK_THRESHOLD,
  NO_CARD_FILTERS,
  balanceDisplay,
  buildReportItems,
  clearedState,
  currencyTotalText,
  groupItems,
  hasCardFilter,
  instrumentItems,
  itemMatches,
  movementSummary,
  parseReportState,
  reportSearch,
  reportTotals,
  splitBalances,
  summaryCards,
  toDailyParams,
  toReportItem,
  toggleCardFilter,
  type CardFilters,
  type CardType,
  type CurrencyTotal,
  type DailyReportState,
  type ReportItem,
  type ReportTexts,
  type WorkPlaceGroup,
} from "./dailyReportLogic";
import { METHOD_OPTIONS } from "./settlementListLogic";

/**
 * `DailySettlementReportPage` prop'ları (FE-0'da donmuş). `type` isteğe bağlı, varsayılan PAYMENT
 * (lazyPage `ComponentType` kuralı, `FundTransactionsPage kind` emsali); rota iki türü `key` ile ayırır.
 */
export type DailySettlementReportPageProps = {
  type?: "PAYMENT" | "COLLECTION";
};

const GAP_10: CSSProperties = { gap: 10 };
const GAP_8: CSSProperties = { gap: 8 };
const GAP_6: CSSProperties = { gap: 6 };
const SMALL: CSSProperties = { fontSize: 11 };
const SMALL_ITALIC: CSSProperties = { fontSize: 11, fontStyle: "italic" };
const COL_70: CSSProperties = { width: 70 };
const COL_160: CSSProperties = { width: 160 };
const STAT_DATE: CSSProperties = { fontSize: 14 };
/** Düz görünümde gizli gruplu görünüm (baskı CSS'indeki !important kuralı onu yine gösterir). */
const HIDDEN: CSSProperties = { display: "none" };
const PILL_BADGE: CSSProperties = { fontSize: 11, padding: "4px 9px" };
const TRANSFER_BADGE: CSSProperties = { ...PILL_BADGE, background: "#ff9800", color: "white" };
const TRANSFER_BADGE_DCR: CSSProperties = { background: "#ff9800", color: "white" };
const TRANSFER_PILL: CSSProperties = { borderColor: "#ffb74d", background: "#fffde7" };
const TRANSFER_PILL_DCR: CSSProperties = { borderColor: "#fdba74" };
const TRANSFER_PILL_ICON_DCR: CSSProperties = { color: "#ff9800" };
const SECTION_TOP: CSSProperties = { borderTop: "1px solid #c7d2fe" };
const CASH_PILL: CSSProperties = {
  borderColor: "#fcd34d",
  background: "#fffbeb",
  color: "#92400e",
};
const CASH_PILL_ICON: CSSProperties = { color: "#f59e0b" };
const UNDEFINED_BLOCK: CSSProperties = { borderColor: "#e5e7eb", background: "#f9fafb" };
const UNDEFINED_TITLE: CSSProperties = { color: "#6b7280" };
const UNDEFINED_PILL: CSSProperties = {
  borderColor: "#d1d5db",
  background: "#fff",
  color: "#374151",
};
const UNDEFINED_PILL_ICON: CSSProperties = { color: "#9ca3af" };
const CREDIT_TOP: CSSProperties = { borderTop: "1px solid #fed7aa" };
const CREDIT_BADGE: CSSProperties = { ...PILL_BADGE, background: "#ea580c", color: "#fff" };
const CREDIT_BLOCK: CSSProperties = { borderColor: "#fdba74", background: "#fff7ed" };
const CREDIT_TITLE: CSSProperties = { color: "#c2410c" };
const CREDIT_PILL: CSSProperties = {
  borderColor: "#fdba74",
  background: "#fff7ed",
  color: "#c2410c",
};
const CREDIT_PILL_ICON: CSSProperties = { color: "#ea580c" };
const GRAND_PILL: CSSProperties = { borderColor: "#6366f1", background: "#f0f0ff" };
const BANK_HEAD: CSSProperties = { background: "#eff6ff" };
const CASH_HEAD: CSSProperties = { background: "#fffbeb" };
const CASH_BADGE: CSSProperties = { ...PILL_BADGE, background: "#f59e0b", color: "white" };
const CASH_ICON: CSSProperties = { color: "#f59e0b" };
const LEGACY_TABLE: CSSProperties = { background: "#fffdf5" };
const DATE_CHECK_TABLE: CSSProperties = { background: "#fff7ed" };
const RESULT_COUNT: CSSProperties = { fontSize: 11 };

type View = "grouped" | "flat";

/**
 * Günlük Ödeme / Tahsilat Raporu (ZTO Views/CustomerAccountPayment/DailyPaymentReport.cshtml,
 * Views/CustomerAccountCollection/DailyCollectionReport.cshtml; 12.2a_TASARIM §5.12; kabuk içi
 * `odemeler/gunluk-rapor`, `tahsilatlar/gunluk-rapor`). Süzgeç durumu URL'de (`reportDate`,
 * `workPlaceIds`, `fundAccountIds`, `currency`, `method`, `sort`); veri `GET /reports/daily`.
 * Gruplama, özet kartları, rapor içi arama ve toplamlar `dailyReportLogic.ts`'te (saf).
 * Blackrose ekleri: İş Yeri çoklu seçimi (S-10), "Sonradan iptal" rozeti (Rev 1 F-4), maskeli
 * personel satırında açıklama "-".
 */
export function DailySettlementReportPage({ type = "PAYMENT" }: DailySettlementReportPageProps) {
  useZtoRootClass("zto-page-daily-settlement-report");
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const payment = type === "PAYMENT";
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const state = useMemo(() => parseReportState(params, today), [params, today]);
  const [draft, setDraft] = useState<DailyReportState>(state);
  useEffect(() => setDraft(state), [state]);

  const report = useDailyReport(toDailyParams(type, state));
  const funds = useFundList({});
  const currencies = useCurrencies();

  const k = useCallback((key: string) => t(`dailyReport.${key}_${type}`), [t, type]);
  const unit = useCallback((count: number) => t(`dailyReport.unit_${type}`, { count }), [t, type]);
  const methodLabel = useCallback((method: PayMethod) => t(`payments.list.method.${method}`), [t]);
  const texts = useMemo<ReportTexts>(
    () => ({
      method: methodLabel,
      cash: (name) => t("dailyReport.table.cash", { name }),
      undefinedFund: t("dailyReport.table.undefinedFund"),
      masked: tc("common.a11y.maskedEmployee"),
      expense: (name) => t("dailyReport.table.expense", { name }),
    }),
    [methodLabel, t, tc],
  );

  // Satır öğeleri: 500'ün altında eşzamanlı; üstünde parçalı (MWG break-up-long-tasks).
  const rows = useMemo(() => report.data?.rows ?? [], [report.data]);
  const syncItems = useMemo(
    () =>
      rows.length < CHUNK_THRESHOLD ? rows.map((row, i) => toReportItem(row, i, texts)) : null,
    [rows, texts],
  );
  const [asyncItems, setAsyncItems] = useState<ReportItem[] | null>(null);
  useEffect(() => {
    if (syncItems !== null) {
      setAsyncItems(null);
      return undefined;
    }
    let cancelled = false;
    void buildReportItems(rows, texts).then((built) => {
      if (!cancelled) setAsyncItems(built);
    });
    return () => {
      cancelled = true;
    };
  }, [rows, texts, syncItems]);
  const items = useMemo(() => syncItems ?? asyncItems ?? [], [syncItems, asyncItems]);

  const [view, setView] = useState<View>("grouped");
  const [term, setTerm] = useState("");
  const deferredTerm = useDeferredValue(term);
  const [cardFilters, setCardFilters] = useState<CardFilters>(NO_CARD_FILTERS);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const allGroups = useMemo(() => groupItems(items), [items]);
  const cards = useMemo(
    () => summaryCards(items, allGroups, methodLabel),
    [items, allGroups, methodLabel],
  );
  const visible = useMemo(
    () => items.filter((item) => itemMatches(item, deferredTerm, cardFilters)),
    [items, deferredTerm, cardFilters],
  );
  const groups = useMemo(() => groupItems(visible), [visible]);
  const totals = useMemo(() => reportTotals(items, type), [items, type]);
  const balances = useMemo(() => splitBalances(report.data?.fundBalances ?? []), [report.data]);
  const movements = report.data?.instrumentFundMovements ?? [];
  const movementTotals = movementSummary(movements);
  const instruments = useMemo(() => instrumentItems(items), [items]);

  const filtering = deferredTerm.trim() !== "";
  const resultText = filtering
    ? t("dailyReport.search.found", { count: visible.length })
    : hasCardFilter(cardFilters)
      ? t("dailyReport.search.cardFilter", { count: visible.length })
      : "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setParams(reportSearch(draft));
  };
  const clear = () => setParams(reportSearch(clearedState(state.reportDate)));
  const update = (patch: Partial<DailyReportState>) => setDraft((d) => ({ ...d, ...patch }));

  const collapseKeys = useMemo(
    () => allGroups.flatMap((g, i) => [`wp_${i}`, ...g.funds.map((_, j) => `bank_${i}_${j}`)]),
    [allGroups],
  );
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const reportDateText = formatDate(state.reportDate);
  const nowText = formatDate(today);
  const fundOptions = (funds.data ?? []).map((fund) => ({
    value: fund.id,
    label:
      fund.kind === "CASH"
        ? t("dailyReport.table.cash", { name: fund.name })
        : fund.bankName?.trim()
          ? `${fund.bankName.trim()}${fund.bankBranchName ? ` - ${fund.bankBranchName}` : ""}`
          : fund.name,
  }));
  const backPath = payment ? paymentsPath() : collectionsPath();

  return (
    <div className={`container-fluid${payment ? "" : " dcr-report"}`}>
      <div
        className="d-flex justify-content-between align-items-center mb-3 flex-wrap report-page-header"
        style={GAP_10}
      >
        <div>
          <h6 className="report-page-title">
            <i
              className={`fas ${payment ? "fa-file-invoice-dollar text-primary" : "fa-file-invoice text-info"} mr-2`}
              aria-hidden="true"
            />
            {t(`dailyReport.title_${type}`, { date: reportDateText })}
          </h6>
          <div className="report-page-subtitle">
            {t(`dailyReport.subtitle_${type}`, { count: rows.length })}
          </div>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm no-print"
            onClick={() => window.print()}
          >
            <i className="fas fa-print mr-1" aria-hidden="true" />
            {t("dailyReport.print")}
          </button>{" "}
          <Link to={backPath} className="btn btn-outline-secondary btn-sm no-print">
            <i className="fas fa-arrow-left mr-1" aria-hidden="true" />
            {k("back")}
          </Link>
        </div>
      </div>

      <div className="report-toolbar">
        <form id="reportFilterForm" onSubmit={submit}>
          <div className="row">
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="reportDate">
                {t("dailyReport.toolbar.date")}
              </label>
              <input
                type="date"
                id="reportDate"
                className="form-control form-control-sm"
                value={draft.reportDate}
                onChange={(event) => update({ reportDate: event.target.value })}
              />
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <ZtoBranchMultiSelect
                variant="dropdown"
                label={t("dailyReport.toolbar.workPlace")}
                value={draft.workPlaceIds}
                onChange={(value) => update({ workPlaceIds: value })}
              />
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="reportFund">
                {t("dailyReport.toolbar.fund")}
              </label>
              <select
                id="reportFund"
                className="form-control form-control-sm"
                value={draft.fundAccountIds[0] ?? ""}
                onChange={(event) =>
                  update({ fundAccountIds: event.target.value ? [event.target.value] : [] })
                }
              >
                <option value="">{t("dailyReport.toolbar.allFunds")}</option>
                {fundOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="reportCurrency">
                {t("dailyReport.toolbar.currency")}
              </label>
              <select
                id="reportCurrency"
                className="form-control form-control-sm"
                value={draft.currency}
                onChange={(event) => update({ currency: event.target.value })}
              >
                <option value="">{t("dailyReport.toolbar.allCurrencies")}</option>
                {(currencies.data ?? []).map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currencySymbol(currency.code) || currency.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="reportMethod">
                {t("dailyReport.toolbar.method")}
              </label>
              <select
                id="reportMethod"
                className="form-control form-control-sm"
                value={draft.method}
                onChange={(event) => update({ method: event.target.value as PayMethod | "" })}
              >
                <option value="">{t("dailyReport.toolbar.allMethods")}</option>
                {METHOD_OPTIONS.map((method) => (
                  <option key={method} value={method}>
                    {methodLabel(method)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="reportSort">
                {t("dailyReport.toolbar.sort")}
              </label>
              <select
                id="reportSort"
                className="form-control form-control-sm"
                value={draft.sort}
                onChange={(event) =>
                  update({ sort: event.target.value === "time-desc" ? "time-desc" : "time-asc" })
                }
              >
                <option value="time-asc">{t("dailyReport.toolbar.sortAsc")}</option>
                <option value="time-desc">{t("dailyReport.toolbar.sortDesc")}</option>
              </select>
            </div>
          </div>
          <div
            className="d-flex justify-content-between align-items-center flex-wrap"
            style={GAP_8}
          >
            <div
              className="btn-group btn-group-sm no-print"
              role="group"
              aria-label={t("dailyReport.toolbar.view")}
            >
              <button
                type="button"
                id="btnGrouped"
                className={`btn btn-outline-primary view-toggle-btn${view === "grouped" ? " active" : ""}`}
                aria-pressed={view === "grouped"}
                onClick={() => setView("grouped")}
              >
                <i className="fas fa-layer-group mr-1" aria-hidden="true" />
                {t("dailyReport.toolbar.grouped")}
              </button>
              <button
                type="button"
                id="btnFlat"
                className={`btn btn-outline-primary view-toggle-btn${view === "flat" ? " active" : ""}`}
                aria-pressed={view === "flat"}
                onClick={() => setView("flat")}
              >
                <i className="fas fa-table mr-1" aria-hidden="true" />
                {t("dailyReport.toolbar.flat")}
              </button>
              <button
                type="button"
                id="btnExpandAll"
                className="btn btn-outline-success view-toggle-btn"
                onClick={() => setCollapsed(new Set())}
              >
                <i className="fas fa-angle-double-down mr-1" aria-hidden="true" />
                {t("dailyReport.toolbar.expandAll")}
              </button>
              <button
                type="button"
                id="btnCollapseAll"
                className="btn btn-outline-secondary view-toggle-btn"
                onClick={() => setCollapsed(new Set(collapseKeys))}
              >
                <i className="fas fa-angle-double-up mr-1" aria-hidden="true" />
                {t("dailyReport.toolbar.collapseAll")}
              </button>
            </div>
            <div className="d-flex" style={GAP_8}>
              <button type="button" className="btn btn-sm btn-light" onClick={clear}>
                <i className="fas fa-undo mr-1" aria-hidden="true" />
                {t("dailyReport.toolbar.clear")}
              </button>
              <button type="submit" className="btn btn-sm btn-primary">
                <i className="fas fa-filter mr-1" aria-hidden="true" />
                {t("dailyReport.toolbar.apply")}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="filters-toolbar search-container">
        <div className="card search-compact-card">
          <div className="card-body">
            <label className="small font-weight-bold mb-1 d-block" htmlFor="reportSearchInput">
              {t("dailyReport.search.label")}
            </label>
            <div className="input-group">
              <div className="input-group-prepend">
                <span className="input-group-text">
                  <i className="fas fa-search" aria-hidden="true" />
                </span>
              </div>
              <input
                type="text"
                id="reportSearchInput"
                className="form-control"
                placeholder={t("dailyReport.search.placeholder")}
                autoComplete="off"
                aria-describedby="reportSearchHelp searchResultCount"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
              />
            </div>
            <div className="search-compact-help" id="reportSearchHelp">
              {t("dailyReport.search.help")}
            </div>
            <div
              id="searchResultCount"
              className="text-muted mt-1"
              style={RESULT_COUNT}
              role="status"
              aria-live="polite"
            >
              {resultText}
            </div>
          </div>
        </div>

        <div className="dynamic-filter-cards">
          {(
            [
              ["workPlace", "fa-building text-primary"],
              ["fund", "fa-university text-info"],
              ["method", "fa-credit-card text-success"],
              ["currency", "fa-coins text-warning"],
            ] as Array<[CardType, string]>
          ).map(([cardType, icon]) => (
            <div className="stat-main-card" key={cardType}>
              <div className="stat-main-header">
                <i className={`fas ${icon}`} aria-hidden="true" />{" "}
                {t(`dailyReport.cards.${cardType}`)}
              </div>
              <div className="stat-items-wrapper">
                {cards[cardType].length === 0 ? (
                  <div className="stat-item">
                    <span>{t("dailyReport.cards.noData")}</span>
                  </div>
                ) : (
                  cards[cardType].slice(0, CARD_LIMIT).map((card) => {
                    const active = cardFilters[cardType].includes(card.value);
                    return (
                      <div
                        key={card.value}
                        className={`stat-item clickable summary-filter-item${active ? " active" : ""}`}
                        data-filter-type={cardType}
                        data-filter-value={card.value}
                        role="button"
                        tabIndex={0}
                        aria-pressed={active}
                        onClick={() =>
                          setCardFilters((f) => toggleCardFilter(f, cardType, card.value))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setCardFilters((f) => toggleCardFilter(f, cardType, card.value));
                          }
                        }}
                      >
                        <span>{card.name}</span>
                        <span className="stat-item-value">{card.count}</span>
                        <span className="stat-item-sub">{card.totalText}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="row mb-3">
        <StatCard payment={payment} icon="fa-file-signature" title={k("stats.total")}>
          <div className="report-stat-value">{rows.length}</div>
        </StatCard>
        <StatCard payment={payment} icon="fa-city" title={t("dailyReport.stats.workPlaces")}>
          <div className="report-stat-value">{allGroups.length}</div>
          <div className="report-stat-sub">{currencyTotalText(items)}</div>
        </StatCard>
        <StatCard payment={payment} icon="fa-calendar-alt" title={t("dailyReport.stats.date")}>
          <div className="report-stat-value" style={STAT_DATE}>
            {reportDateText}
          </div>
          <div className="report-stat-sub">{k("stats.list")}</div>
        </StatCard>
      </div>

      {report.isPending ? (
        <div className="empty-card" role="status">
          <i className="fas fa-spinner fa-spin mr-1" aria-hidden="true" />
          {t("dailyReport.loading")}
        </div>
      ) : report.isError ? (
        <div className="empty-card text-danger" role="alert">
          <i className="fas fa-exclamation-triangle mr-1" aria-hidden="true" />
          {t("dailyReport.loadFailed")}
        </div>
      ) : (
        <>
          {/*
           * Gruplu görünüm her zaman DOM'da (zto-onyuz:F2): kopyalanan ZTO baskı CSS'i
           * `#groupedView {display:block !important}` + `#flatView {display:none !important}` ile her
           * zaman gruplu görünümü basar. Düz görünümde satır içi `display:none` (important değil) baskı
           * kuralına yenilir; Bootstrap `d-none` (important) kullanılmaz.
           */}
          <div id="groupedView" className="show" style={view === "grouped" ? undefined : HIDDEN}>
            {groups.length > 0 ? (
              <div id="workPlaceAccordion">
                {groups.map((group) => (
                  <WorkPlaceBlock
                    key={group.branchId}
                    group={group}
                    index={allGroups.findIndex((g) => g.branchId === group.branchId)}
                    allGroups={allGroups}
                    collapsed={collapsed}
                    onToggle={toggle}
                    unit={unit}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-card">
                <i className="fas fa-info-circle mr-1" aria-hidden="true" />
                {k("table.empty")}
              </div>
            )}
          </div>
          {view === "flat" ? (
            <div id="flatView">
              <div
                className="table-responsive"
                role="region"
                aria-label={t("dailyReport.toolbar.flat")}
                tabIndex={0}
              >
                <table className="table table-sm table-bordered table-hover report-table mb-0">
                  <thead>
                    <tr>
                      <th style={COL_70}>{t("dailyReport.table.no")}</th>
                      <th>{t("dailyReport.table.time")}</th>
                      <th>{t("dailyReport.table.workPlace")}</th>
                      <th>{t("dailyReport.table.account")}</th>
                      <th>{t("dailyReport.table.documentNo")}</th>
                      <th>{t("dailyReport.table.method")}</th>
                      <th>{t("dailyReport.table.source")}</th>
                      <th className="text-right">{t("dailyReport.table.amount")}</th>
                      <th>{t("dailyReport.table.description")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => (
                      <ReportRow key={item.row.id} item={item} flat />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className="totals-footer-card">
        <div className="d-flex align-items-center justify-content-between flex-wrap" style={GAP_8}>
          <div>
            <strong>
              <i className="fas fa-calculator text-primary mr-1" aria-hidden="true" />
              {t("dailyReport.totals.title")}
            </strong>
            <div className="text-muted" style={SMALL}>
              {k("totals.subtitle")}
            </div>
          </div>
          <div className="text-muted" style={SMALL}>
            {t("dailyReport.totals.reportDate", { date: reportDateText })}
          </div>
        </div>

        {payment ? (
          <div className="mt-2">
            <div className="d-flex align-items-center mb-1" style={GAP_6}>
              <span className="badge" style={TRANSFER_BADGE}>
                <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />
                {t("dailyReport.totals.transfers")}
              </span>
              <span className="text-muted" style={SMALL}>
                {unit(totals.transfer.count)}
              </span>
            </div>
            {totals.transfer.totals.length > 0 ? (
              totals.transfer.totals.map((total) => (
                <Pill
                  key={total.symbol}
                  total={total}
                  style={TRANSFER_PILL}
                  suffix={unit(total.count)}
                />
              ))
            ) : (
              <span className="text-muted" style={SMALL_ITALIC}>
                {t("dailyReport.totals.noTransfers")}
              </span>
            )}
          </div>
        ) : (
          totals.transfer.count > 0 && (
            <div className="mt-2">
              <div className="mb-1">
                <span className="badge" style={TRANSFER_BADGE_DCR}>
                  <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />
                  {t("dailyReport.totals.transfers")} ({unit(totals.transfer.count)})
                </span>
              </div>
              {totals.transfer.totals.map((total) => (
                <Pill
                  key={total.symbol}
                  total={total}
                  style={TRANSFER_PILL_DCR}
                  icon="fa-exchange-alt"
                  iconStyle={TRANSFER_PILL_ICON_DCR}
                  suffix={unit(total.count)}
                />
              ))}
            </div>
          )
        )}

        {(payment || totals.regular.count > 0) && (
          <div className="mt-2 pt-2" style={SECTION_TOP}>
            {payment ? (
              <div className="d-flex align-items-center mb-1" style={GAP_6}>
                <span className="badge badge-primary" style={PILL_BADGE}>
                  <i className="fas fa-file-invoice-dollar mr-1" aria-hidden="true" />
                  {k("totals.regular")}
                </span>
                <span className="text-muted" style={SMALL}>
                  {unit(totals.regular.count)}
                </span>
              </div>
            ) : (
              <div className="mb-1">
                <span className="badge badge-primary">
                  <i className="fas fa-coins mr-1" aria-hidden="true" />
                  {k("totals.regular")} ({unit(totals.regular.count)})
                </span>
              </div>
            )}
            {totals.regular.count > 0 ? (
              <div className="totals-split-row">
                {totals.regular.bank && (
                  <div className="totals-split-block bank-block">
                    <div className="totals-block-title">
                      <i className="fas fa-university" aria-hidden="true" />{" "}
                      {t("dailyReport.totals.bankTotals")} ({unit(totals.regular.bank.count)})
                    </div>
                    {totals.regular.bank.totals.map((total) => (
                      <Pill key={total.symbol} total={total} suffix={String(total.count)} />
                    ))}
                  </div>
                )}
                {totals.regular.cashes.map((cash, index) => (
                  <Fragment key={cash.name}>
                    {(totals.regular.bank || index > 0) && <div className="totals-split-divider" />}
                    <div className="totals-split-block cash-block">
                      <div className="totals-block-title">
                        <i className="fas fa-cash-register" aria-hidden="true" /> {cash.name} (
                        {unit(cash.count)})
                      </div>
                      {cash.totals.map((total) => (
                        <Pill
                          key={total.symbol}
                          total={total}
                          style={CASH_PILL}
                          iconStyle={CASH_PILL_ICON}
                          suffix={String(total.count)}
                        />
                      ))}
                    </div>
                  </Fragment>
                ))}
                {totals.regular.undefined && (
                  <>
                    {(totals.regular.bank || totals.regular.cashes.length > 0) && (
                      <div className="totals-split-divider" />
                    )}
                    <div className="totals-split-block" style={UNDEFINED_BLOCK}>
                      <div className="totals-block-title" style={UNDEFINED_TITLE}>
                        <i className="fas fa-question-circle" aria-hidden="true" />{" "}
                        {t("dailyReport.totals.undefined")} ({unit(totals.regular.undefined.count)})
                      </div>
                      {totals.regular.undefined.totals.map((total) => (
                        <Pill
                          key={total.symbol}
                          total={total}
                          style={UNDEFINED_PILL}
                          iconStyle={UNDEFINED_PILL_ICON}
                          suffix={String(total.count)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <span className="text-muted" style={SMALL_ITALIC}>
                {t("dailyReport.totals.noRegular")}
              </span>
            )}
          </div>
        )}

        {totals.credit && (
          <div className="mt-2 pt-2" style={CREDIT_TOP}>
            <div className="d-flex align-items-center mb-1" style={GAP_6}>
              <span className="badge" style={CREDIT_BADGE}>
                <i className="fas fa-hand-holding-usd mr-1" aria-hidden="true" />
                {t("dailyReport.totals.credit")}
              </span>
              <span className="text-muted" style={SMALL}>
                {unit(totals.credit.count)}
              </span>
            </div>
            <div className="totals-split-row">
              <div className="totals-split-block" style={CREDIT_BLOCK}>
                <div className="totals-block-title" style={CREDIT_TITLE}>
                  <i className="fas fa-landmark" aria-hidden="true" />{" "}
                  {t("dailyReport.totals.creditTotals")}
                </div>
                {totals.credit.totals.map((total) => (
                  <Pill
                    key={total.symbol}
                    total={total}
                    style={CREDIT_PILL}
                    iconStyle={CREDIT_PILL_ICON}
                    suffix={String(total.count)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 pt-2" style={SECTION_TOP}>
          <div className="d-flex align-items-center flex-wrap mb-1" style={GAP_6}>
            {payment ? (
              <>
                <span className="badge badge-dark" style={PILL_BADGE}>
                  <i className="fas fa-calculator mr-1" aria-hidden="true" />
                  {t("dailyReport.totals.grand")}
                </span>
                <span className="text-muted" style={SMALL}>
                  {unit(totals.grand.count)}
                </span>
              </>
            ) : (
              <span className="badge badge-dark">
                <i className="fas fa-calculator mr-1" aria-hidden="true" />
                {t("dailyReport.totals.grand")} ({unit(totals.grand.count)})
              </span>
            )}
            <span className="text-muted" style={SMALL_ITALIC}>
              = {t("dailyReport.totals.transfers")} + {k("totals.regular")} (
              {t("dailyReport.totals.banks")} + {t("dailyReport.totals.cashes")})
              {totals.credit ? ` + ${t("dailyReport.totals.credit")}` : ""}
            </span>
          </div>
          {totals.grand.totals.length > 0 ? (
            totals.grand.totals.map((total) => (
              <Pill
                key={total.symbol}
                total={total}
                style={payment ? GRAND_PILL : undefined}
                suffix={unit(total.count)}
              />
            ))
          ) : (
            <span className="text-muted">{t("dailyReport.totals.noTotals")}</span>
          )}
        </div>
      </div>

      {payment ? (
        <>
          <BalanceCard balances={balances} dateText={reportDateText} nowText={nowText} />
          <div className="legacy-checks-card">
            <ChecksHeader
              icon="fa-file-signature text-warning"
              title={t("dailyReport.checks.legacyTitle")}
              help={k("checks.legacyHelp")}
              badge={
                <div className="legacy-check-badge">
                  <span>{unit(movementTotals.count)}</span>
                  <span>|</span>
                  <span>{movementTotals.text}</span>
                </div>
              }
            />
            <MovementTable type={type} movements={movements} style={LEGACY_TABLE} />
          </div>
          <div className="payment-date-checks-card">
            <ChecksHeader
              icon="fa-calendar-check text-warning"
              title={k("checks.dateTitle")}
              help={k("checks.dateHelp")}
              badge={
                <div className="legacy-check-badge">
                  <span>{unit(instruments.length)}</span>
                  <span>|</span>
                  <span>{currencyTotalText(instruments)}</span>
                </div>
              }
            />
            <InstrumentTable type={type} items={instruments} style={DATE_CHECK_TABLE} />
          </div>
        </>
      ) : (
        <div className="totals-footer-card mt-3">
          <div className="totals-footer-card mt-3">
            <ChecksHeader
              icon="fa-money-check-alt text-warning"
              title={t("dailyReport.checks.legacyTitle")}
              help={k("checks.legacyHelp")}
              badge={
                <div className="text-muted" style={SMALL}>
                  {t("dailyReport.checks.totalChecks")} <b>{movementTotals.count}</b> |{" "}
                  {movementTotals.text}
                </div>
              }
            />
            <MovementTable type={type} movements={movements} />
          </div>
          <div className="totals-footer-card mt-3">
            <ChecksHeader
              icon="fa-calendar-check text-success"
              title={k("checks.dateTitle")}
              help={k("checks.dateHelp")}
              badge={
                <div className="text-muted" style={SMALL}>
                  {t("dailyReport.checks.totalChecks")} <b>{instruments.length}</b> |{" "}
                  {currencyTotalText(instruments)}
                </div>
              }
            />
            <InstrumentTable type={type} items={instruments} />
          </div>
          <BalanceCard balances={balances} dateText={reportDateText} nowText={nowText} bare />
        </div>
      )}
    </div>
  );
}

function MovementTable({
  type,
  movements,
  style,
}: {
  type: SettlementType;
  movements: readonly DailyInstrumentMovement[];
  style?: CSSProperties;
}) {
  const { t } = useTranslation("ztoFinans");
  const kk = (key: string) => t(`dailyReport.checks.${key}_${type}`);
  return (
    <div
      className="table-responsive mt-2"
      role="region"
      aria-label={t("dailyReport.checks.legacyTitle")}
      tabIndex={0}
    >
      <table className="table table-sm table-bordered table-hover mb-0 report-table" style={style}>
        <thead>
          <tr>
            <th>{t("dailyReport.checks.workPlace")}</th>
            <th>{kk("fund")}</th>
            <th className="text-right">{kk("count")}</th>
            <th className="text-right">{kk("total")}</th>
          </tr>
        </thead>
        <tbody>
          {movements.length > 0 ? (
            movements.map((m) => (
              <tr key={`${m.branchId}_${m.fundAccountId}_${m.currency}`}>
                <td className={type === "PAYMENT" ? "font-weight-bold" : undefined}>
                  {m.branchName}
                </td>
                <td>{m.fundName}</td>
                <td className="text-right">{m.count}</td>
                <td className="text-right">
                  {formatN2(m.total)} {currencySymbol(m.currency)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="text-center text-muted">
                {kk("legacyEmpty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function InstrumentTable({
  type,
  items,
  style,
}: {
  type: SettlementType;
  items: readonly ReportItem[];
  style?: CSSProperties;
}) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const kk = (key: string) => t(`dailyReport.checks.${key}_${type}`);
  return (
    <div className="table-responsive mt-2" role="region" aria-label={kk("dateTitle")} tabIndex={0}>
      <table className="table table-sm table-bordered table-hover mb-0 report-table" style={style}>
        <thead>
          <tr>
            <th>{kk("dateCol")}</th>
            <th>{t("dailyReport.checks.workPlace")}</th>
            <th>{t("dailyReport.checks.account")}</th>
            <th>{t("dailyReport.checks.checkNo")}</th>
            <th>{kk("fund")}</th>
            <th>{t("dailyReport.checks.status")}</th>
            <th className="text-right">{t("dailyReport.checks.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {items.length > 0 ? (
            items.map((item) => (
              <tr key={item.row.id}>
                <td>{formatDate(item.row.settlementDate)}</td>
                <td className={type === "PAYMENT" ? "font-weight-bold" : undefined}>
                  {item.row.branchName}
                </td>
                <td>
                  <div className="font-weight-bold">{item.accountText}</div>
                  <small className="text-muted">
                    {item.row.employeeMasked ? "" : (item.row.accountCode ?? "")}
                  </small>
                </td>
                <td>{item.row.instrumentNumber || "-"}</td>
                <td>{item.source || "-"}</td>
                <td>
                  {item.row.instrumentStatus
                    ? tc(`finance.instrumentStatus.${item.row.instrumentStatus}`, {
                        defaultValue: item.row.instrumentStatus,
                      })
                    : "-"}
                </td>
                <td className="text-right">
                  {formatN2(item.row.money.amount)} {currencySymbol(item.row.money.currency)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="text-center text-muted">
                {kk("dateEmpty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  payment,
  icon,
  title,
  children,
}: {
  payment: boolean;
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={payment ? "col-4 mb-2" : "col-lg-4 col-md-6 mb-2"}>
      <div className="report-stat-card">
        <div className="report-stat-icon" aria-hidden="true">
          <i className={`fas ${icon}`} />
        </div>
        <div>
          <div className="report-stat-title">{title}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Pill({
  total,
  style,
  icon = "fa-coins",
  iconStyle,
  suffix,
}: {
  total: CurrencyTotal;
  style?: CSSProperties;
  icon?: string;
  iconStyle?: CSSProperties;
  suffix: string;
}) {
  return (
    <span className="currency-total-pill" style={style}>
      <i className={`fas ${icon}`} style={iconStyle} aria-hidden="true" /> {formatN2(total.total)}{" "}
      {total.symbol}{" "}
      <span className="text-muted" style={SMALL}>
        ({suffix})
      </span>
    </span>
  );
}

function ChecksHeader({
  icon,
  title,
  help,
  badge,
}: {
  icon: string;
  title: string;
  help: string;
  badge: ReactNode;
}) {
  return (
    <div className="d-flex align-items-center justify-content-between flex-wrap" style={GAP_8}>
      <div>
        <strong>
          <i className={`fas ${icon} mr-1`} aria-hidden="true" />
          {title}
        </strong>
        <div className="text-muted" style={SMALL}>
          {help}
        </div>
      </div>
      {badge}
    </div>
  );
}

function BalanceCard({
  balances,
  dateText,
  nowText,
  bare = false,
}: {
  balances: ReturnType<typeof splitBalances>;
  dateText: string;
  nowText: string;
  /** DCR: kartın içinde (kendi `totals-footer-card` sarmalayıcısı yok). */
  bare?: boolean;
}) {
  const { t } = useTranslation("ztoFinans");
  const b = (key: string, values?: Record<string, unknown>) =>
    t(`dailyReport.balance.${key}`, values);
  const table = (kind: "BANK" | "CASH") => {
    const list = kind === "BANK" ? balances.banks : balances.cashes;
    const bank = kind === "BANK";
    return (
      <div className="mt-3">
        <div className="mb-1">
          {bank ? (
            <span className="badge badge-primary" style={PILL_BADGE}>
              <i className="fas fa-university mr-1" aria-hidden="true" />
              {b("banks", { count: list.length })}
            </span>
          ) : (
            <span className="badge" style={CASH_BADGE}>
              <i className="fas fa-cash-register mr-1" aria-hidden="true" />
              {b("cashes", { count: list.length })}
            </span>
          )}
        </div>
        <div
          className="table-responsive"
          role="region"
          aria-label={b(bank ? "banks" : "cashes", { count: list.length })}
          tabIndex={0}
        >
          <table className="table table-sm table-bordered table-hover mb-0 report-table">
            <thead style={bank ? BANK_HEAD : CASH_HEAD}>
              <tr>
                <th>{b(bank ? "bankAccount" : "cashAccount")}</th>
                <th className="text-right">{b("dayEnd", { date: dateText })}</th>
                <th className="text-right">{b("current", { date: nowText })}</th>
              </tr>
            </thead>
            <tbody>
              {list.length > 0 ? (
                list.map((balance) => {
                  const symbol = currencySymbol(balance.currency);
                  return (
                    <tr key={balance.fundAccountId}>
                      <td className="font-weight-bold">
                        {bank ? (
                          <i className="fas fa-university text-primary mr-1" aria-hidden="true" />
                        ) : (
                          <>
                            <i
                              className="fas fa-cash-register"
                              style={CASH_ICON}
                              aria-hidden="true"
                            />{" "}
                          </>
                        )}
                        {balanceDisplay(balance)}
                      </td>
                      <td className="text-right">
                        {formatN2(balance.balanceAtDate)} {symbol}
                      </td>
                      <td className="text-right">
                        {formatN2(balance.balanceNow)} {symbol}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} className="text-center text-muted">
                    {b(bank ? "noBank" : "noCash")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };
  const content = (
    <>
      <div className="d-flex align-items-center justify-content-between flex-wrap" style={GAP_8}>
        <div>
          <strong>
            <i className="fas fa-university text-info mr-1" aria-hidden="true" />
            {b("title")}
          </strong>
          <div className="text-muted" style={SMALL}>
            {b("subtitle")}
          </div>
        </div>
      </div>
      {table("BANK")}
      {table("CASH")}
    </>
  );
  return bare ? content : <div className="totals-footer-card mt-3">{content}</div>;
}

function WorkPlaceBlock({
  group,
  index,
  allGroups,
  collapsed,
  onToggle,
  unit,
}: {
  group: WorkPlaceGroup;
  index: number;
  allGroups: readonly WorkPlaceGroup[];
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
  unit: (count: number) => string;
}) {
  const { t } = useTranslation("ztoFinans");
  const wpKey = `wp_${index}`;
  const wpId = `workPlaceCollapse_${index}`;
  const wpOpen = !collapsed.has(wpKey);
  const fundIndex = (key: string) => allGroups[index]?.funds.findIndex((f) => f.key === key) ?? -1;
  return (
    <div className="mb-2 workplace-block" data-workplace-block data-workplace-id={group.branchId}>
      <button
        className="workplace-header-btn"
        type="button"
        aria-expanded={wpOpen}
        aria-controls={wpId}
        onClick={() => onToggle(wpKey)}
      >
        <span>
          <i className="fas fa-building mr-2 text-primary" aria-hidden="true" />
          {group.name}
        </span>
        <span className="summary-badges">
          <span className="summary-badge">{unit(group.items.length)}</span>
          <span className="summary-badge currency">{group.totalText}</span>
        </span>
      </button>
      <div id={wpId} className={`collapse mt-2${wpOpen ? " show" : ""}`}>
        <div className="pl-2">
          {group.funds.map((fund) => {
            const j = fundIndex(fund.key);
            const bankKey = `bank_${index}_${j}`;
            const bankId = `bankCollapse_${index}_${j}`;
            const open = !collapsed.has(bankKey);
            const cash = fund.kind === "CASH";
            return (
              <div
                key={fund.key}
                className="mb-2 bank-block"
                data-bank-block
                data-bank-id={fund.key}
                data-workplace-id={group.branchId}
              >
                <button
                  className={cash ? "cash-header-btn" : "bank-header-btn"}
                  type="button"
                  aria-expanded={open}
                  aria-controls={bankId}
                  onClick={() => onToggle(bankKey)}
                >
                  <span>
                    <div>
                      <i
                        className={`fas ${cash ? "fa-cash-register text-warning" : "fa-university text-info"} mr-2`}
                        aria-hidden="true"
                      />
                      {fund.title}
                    </div>
                    <div className="bank-meta">
                      <small>
                        <i className="fas fa-code-branch mr-1" aria-hidden="true" />
                        {fund.meta}
                      </small>
                    </div>
                  </span>
                  <span className="summary-badges">
                    <span className="summary-badge">{unit(fund.items.length)}</span>
                    <span className="summary-badge currency">{fund.totalText}</span>
                  </span>
                </button>
                <div id={bankId} className={`collapse mt-2${open ? " show" : ""}`}>
                  <div
                    className="table-responsive"
                    role="region"
                    aria-label={`${group.name} - ${fund.title}`}
                    tabIndex={0}
                  >
                    <table className="table table-sm table-bordered table-hover report-table mb-0">
                      <thead>
                        <tr>
                          <th style={COL_70}>{t("dailyReport.table.no")}</th>
                          <th>{t("dailyReport.table.time")}</th>
                          <th>{t("dailyReport.table.account")}</th>
                          <th>{t("dailyReport.table.documentNo")}</th>
                          <th>{t("dailyReport.table.method")}</th>
                          <th>{t("dailyReport.table.source")}</th>
                          <th style={COL_160} className="text-right">
                            {t("dailyReport.table.amount")}
                          </th>
                          <th>{t("dailyReport.table.description")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fund.items.map((item) => (
                          <ReportRow key={item.row.id} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReportRow({ item, flat = false }: { item: ReportItem; flat?: boolean }) {
  const { t } = useTranslation("ztoFinans");
  const row = item.row;
  const transfer = row.intercompany;
  const description = row.employeeMasked ? "" : (row.description ?? "").trim();
  return (
    <tr
      className={`${flat ? "report-row-flat" : "report-row"}${transfer ? " workplace-transfer-row" : ""}`}
      data-workplace-id={row.branchId}
      data-bank-id={item.fundKey}
      data-currency-id={row.money.currency}
      data-method={item.method}
    >
      <td>{item.no}</td>
      <td>{item.time}</td>
      {flat && (
        <td>
          <div className="font-weight-bold">{row.branchName}</div>
          <small className="text-muted">{row.branchGroupName ?? ""}</small>
        </td>
      )}
      <td>
        <div className="font-weight-bold">
          {item.accountText}
          {transfer && (
            <>
              {" "}
              <span className="transfer-badge">
                <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />
                {t("dailyReport.table.transferBadge")}
              </span>
            </>
          )}
        </div>
        <small className="text-muted">{row.employeeMasked ? "" : (row.accountCode ?? "")}</small>
      </td>
      <td>{row.documentNo?.trim() || "-"}</td>
      <td>{t(`payments.list.method.${item.method}`)}</td>
      <td>{item.source}</td>
      <td className="text-right">
        {formatN2(row.money.amount)} {currencySymbol(row.money.currency)}
        {row.reversedOn && (
          <>
            <br />
            <span className="badge badge-light">
              {t("dailyReport.table.reversedLater", { date: formatDate(row.reversedOn) })}
            </span>
          </>
        )}
      </td>
      <td>{description || "-"}</td>
    </tr>
  );
}
