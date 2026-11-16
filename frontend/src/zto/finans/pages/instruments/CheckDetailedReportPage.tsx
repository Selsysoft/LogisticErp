import { CSSProperties, FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { useFundList } from "../../../../pages/finance/fundApi";
import { useInstrumentList } from "../../../../pages/finance/instrumentApi";
import type { Fund } from "../../../../pages/finance/types";
import { formatDate, formatN2 } from "../../../components";
import { currencySymbol } from "../../../format";
import { checksPath } from "../../navItems";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import {
  NO_CARD_FILTERS,
  REPORT_SORTS,
  applyFormFilters,
  currencyTotals,
  dayBadge,
  groupReport,
  parseReportState,
  reportRowText,
  reportSearch,
  rowVisible,
  sortReportRows,
  summaryCards,
  toReportRows,
  toggleCardFilter,
  validateReportRange,
  type CardFilters,
  type ReportState,
  type SummaryCard,
} from "./checkReportLogic";
import { statusLabelKey } from "./instrumentLogic";

const HEADER_GAP: CSSProperties = { gap: 10 };
const ACTIONS_GAP: CSSProperties = { gap: 8 };
const SMALL_TEXT: CSSProperties = { fontSize: 11 };
const RANGE_VALUE: CSSProperties = { fontSize: 14 };
const COL_ID: CSSProperties = { width: 65 };
const COL_AMOUNT: CSSProperties = { width: 160 };

/**
 * Detaylı Çek Raporu (ZTO Views/Checks/CheckDetailedReport.cshtml + ChecksController.CheckDetailedReport;
 * 12.3 §5.4). Kabuksuz yazdırma sayfası (`/zto-finans-yazdir/cek-raporu`). Veri istemci kipindeki
 * çek listesidir (kendi çekimiz, vade aralığı, iptal hariç); İş Yeri / Banka / Para Birimi / Sıralama
 * süzgeçleri ve gruplama istemcide (ZTO sunucuda). Grup başlıkları ZTO `collapse` düğmeleri gibi
 * aç/kapa yapar (`aria-expanded`); yazdırmada hepsi açık.
 */
export function CheckDetailedReportPage() {
  const { t } = useTranslation("ztoFinans");
  const r = (key: string, values?: Record<string, unknown>) => t(`checks.report.${key}`, values);
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const state = useMemo(() => parseReportState(params, today), [params, today]);
  const [draft, setDraft] = useState<ReportState>(state);
  useEffect(() => setDraft(state), [state]);
  const [formError, setFormError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const deferredTerm = useDeferredValue(term);
  const [cards, setCards] = useState<CardFilters>(NO_CARD_FILTERS);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    document.title = r("pageTitle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useInstrumentList({
    kind: "CHECK",
    direction: "ISSUED",
    dueFrom: state.from,
    dueTo: state.to,
  });
  const funds = useFundList({ kind: "BANK" });
  const fundMap = useMemo(
    () => new Map<string, Fund>((funds.data ?? []).map((fund) => [fund.id, fund])),
    [funds.data],
  );

  const allRows = useMemo(
    () =>
      toReportRows(list.data?.rows ?? [], today, {
        workPlace: r("workPlaceFallback"),
        bank: r("bankFallback"),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, today, t],
  );
  const rows = useMemo(
    () => sortReportRows(applyFormFilters(allRows, state), state.sortBy),
    [allRows, state],
  );
  const groups = useMemo(() => groupReport(rows, fundMap), [rows, fundMap]);
  const summary = useMemo(() => summaryCards(rows, groups), [rows, groups]);
  const totals = useMemo(() => currencyTotals(rows), [rows]);

  const options = useMemo(() => {
    const unique = (pairs: Array<[string, string]>) =>
      [...new Map(pairs).entries()].sort((a, b) => a[1].localeCompare(b[1], "tr"));
    return {
      workPlaces: unique(allRows.map((row) => [row.workPlaceId, row.workPlaceName])),
      banks: unique(allRows.map((row) => [row.bankId, row.bankName])),
      currencies: unique(allRows.map((row) => [row.currency, currencySymbol(row.currency)])),
    };
  }, [allRows]);

  const statusText = (row: (typeof rows)[number]) =>
    t(statusLabelKey(row.item.kind, row.item.direction, row.item.status));
  const visible = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const text = reportRowText(
        row,
        t(statusLabelKey(row.item.kind, row.item.direction, row.item.status)),
      );
      if (rowVisible(row, text, deferredTerm, cards)) set.add(row.item.id);
    }
    return set;
  }, [rows, deferredTerm, cards, t]);

  const hasCardFilter = !!(cards.workPlace || cards.bank || cards.currency);
  const resultText =
    deferredTerm.trim() === ""
      ? hasCardFilter
        ? r("cardFilterActive", { count: visible.size })
        : ""
      : r("searchFound", { count: visible.size });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const key = validateReportRange(draft.from, draft.to);
    if (key) {
      setFormError(t(key));
      return;
    }
    setFormError(null);
    setParams(reportSearch(draft), { replace: true });
  };
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const fromText = formatDate(state.from);
  const toText = formatDate(state.to);
  const update = (patch: Partial<ReportState>) => setDraft((d) => ({ ...d, ...patch }));

  const cardList = (items: SummaryCard[]) =>
    items.length > 0 ? (
      items.map((item) => {
        const active = cards[item.type] === item.value;
        return (
          <button
            type="button"
            key={`${item.type}-${item.value}`}
            className={`stat-item clickable summary-filter-item${active ? " active" : ""}`}
            aria-pressed={active}
            data-filter-type={item.type}
            onClick={() => setCards((c) => toggleCardFilter(c, item.type, item.value))}
          >
            <span>{item.name}</span>
            <span className="stat-item-value">{item.count}</span>
            <span className="stat-item-sub">{item.totalsText}</span>
          </button>
        );
      })
    ) : (
      <div className="stat-item">
        <span>{r("noData")}</span>
      </div>
    );

  return (
    <div className="container-fluid">
      <div
        className="d-flex justify-content-between align-items-center mb-3 flex-wrap report-page-header"
        style={HEADER_GAP}
      >
        <div>
          <h1 className="h6 report-page-title">
            <i className="fas fa-file-invoice-dollar text-primary mr-2" aria-hidden="true" />
            {r("heading", { from: fromText, to: toText })}
          </h1>
          <div className="report-page-subtitle">{r("subtitle")}</div>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm no-print"
            onClick={() => window.print()}
          >
            <i className="fas fa-print mr-1" aria-hidden="true" />
            {r("print")}
          </button>{" "}
          <Link to={checksPath()} className="btn btn-outline-secondary btn-sm no-print">
            <i className="fas fa-arrow-left mr-1" aria-hidden="true" />
            {r("backToList")}
          </Link>
        </div>
      </div>

      <div className="report-toolbar">
        <form id="reportFilterForm" onSubmit={submit} noValidate>
          <div className="row">
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="cdrStart">
                {r("dueStart")}
              </label>
              <input
                type="date"
                id="cdrStart"
                className="form-control form-control-sm"
                name="startDate"
                value={draft.from}
                aria-invalid={!!formError}
                onChange={(event) => update({ from: event.target.value })}
              />
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="cdrEnd">
                {r("dueEnd")}
              </label>
              <input
                type="date"
                id="cdrEnd"
                className="form-control form-control-sm"
                name="endDate"
                value={draft.to}
                aria-invalid={!!formError}
                onChange={(event) => update({ to: event.target.value })}
              />
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="workPlaceFilterSelect">
                {r("workPlace")}
              </label>
              <select
                id="workPlaceFilterSelect"
                className="form-control form-control-sm"
                name="workPlaceId"
                value={draft.workPlaceId}
                onChange={(event) => update({ workPlaceId: event.target.value })}
              >
                <option value="">{r("allWorkPlaces")}</option>
                {options.workPlaces.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="bankFilterSelect">
                {r("bank")}
              </label>
              <select
                id="bankFilterSelect"
                className="form-control form-control-sm"
                name="bankId"
                value={draft.bankId}
                onChange={(event) => update({ bankId: event.target.value })}
              >
                <option value="">{r("allBanks")}</option>
                {options.banks.map(([value, label]) => (
                  <option key={value || "none"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="currencyFilterSelect">
                {r("currency")}
              </label>
              <select
                id="currencyFilterSelect"
                className="form-control form-control-sm"
                name="currencyId"
                value={draft.currency}
                onChange={(event) => update({ currency: event.target.value })}
              >
                <option value="">{r("allCurrencies")}</option>
                {options.currencies.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-lg-2 col-md-6 mb-2">
              <label className="small font-weight-bold mb-1" htmlFor="cdrSort">
                {r("sort")}
              </label>
              <select
                id="cdrSort"
                className="form-control form-control-sm"
                name="sortBy"
                value={draft.sortBy}
                onChange={(event) =>
                  update({ sortBy: event.target.value as ReportState["sortBy"] })
                }
              >
                {REPORT_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {r(`sortOption.${sort}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {formError && (
            <div className="alert alert-warning py-1 mb-2" role="alert">
              {formError}
            </div>
          )}
          <div className="d-flex justify-content-end" style={ACTIONS_GAP}>
            <button
              type="button"
              className="btn btn-sm btn-light"
              onClick={() => {
                setFormError(null);
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              <i className="fas fa-undo mr-1" aria-hidden="true" />
              {r("clear")}
            </button>
            <button type="submit" className="btn btn-sm btn-primary">
              <i className="fas fa-filter mr-1" aria-hidden="true" />
              {r("filter")}
            </button>
          </div>
        </form>
      </div>

      <div className="filters-toolbar search-container">
        <div className="card search-compact-card">
          <div className="card-body">
            <label className="small font-weight-bold mb-1 d-block" htmlFor="reportSearchInput">
              {r("searchLabel")}
            </label>
            <div className="input-group">
              <div className="input-group-prepend">
                <span className="input-group-text" aria-hidden="true">
                  <i className="fas fa-search" />
                </span>
              </div>
              <input
                type="search"
                id="reportSearchInput"
                className="form-control"
                placeholder={r("searchPlaceholder")}
                autoComplete="off"
                aria-describedby="reportSearchHelp"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
              />
            </div>
            <div className="search-compact-help" id="reportSearchHelp">
              {r("searchHelp")}
            </div>
            <div
              id="searchResultCount"
              className="text-muted mt-1"
              style={SMALL_TEXT}
              role="status"
            >
              {resultText}
            </div>
          </div>
        </div>

        <div className="dynamic-filter-cards">
          <div className="stat-main-card">
            <div className="stat-main-header">
              <i className="fas fa-building text-primary" aria-hidden="true" />{" "}
              {r("workPlaceSummary")}
            </div>
            <div className="stat-items-wrapper">{cardList(summary.workPlaces)}</div>
          </div>
          <div className="stat-main-card">
            <div className="stat-main-header">
              <i className="fas fa-university text-info" aria-hidden="true" /> {r("bankSummary")}
            </div>
            <div className="stat-items-wrapper">{cardList(summary.banks)}</div>
          </div>
          <div className="stat-main-card">
            <div className="stat-main-header">
              <i className="fas fa-coins text-warning" aria-hidden="true" /> {r("currencySummary")}
            </div>
            <div className="stat-items-wrapper">{cardList(summary.currencies)}</div>
          </div>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-4 mb-2">
          <div className="report-stat-card">
            <div className="report-stat-icon" aria-hidden="true">
              <i className="fas fa-file-signature" />
            </div>
            <div>
              <div className="report-stat-title">{r("totalChecks")}</div>
              <div className="report-stat-value">{rows.length}</div>
            </div>
          </div>
        </div>
        <div className="col-4 mb-2">
          <div className="report-stat-card">
            <div className="report-stat-icon" aria-hidden="true">
              <i className="fas fa-city" />
            </div>
            <div>
              <div className="report-stat-title">{r("workPlaceCount")}</div>
              <div className="report-stat-value">{groups.length}</div>
            </div>
          </div>
        </div>
        <div className="col-4 mb-2">
          <div className="report-stat-card">
            <div className="report-stat-icon" aria-hidden="true">
              <i className="fas fa-calendar-alt" />
            </div>
            <div>
              <div className="report-stat-title">{r("range")}</div>
              <div className="report-stat-value" style={RANGE_VALUE}>
                {fromText} - {toText}
              </div>
              <div className="report-stat-sub">{r("rangeSub")}</div>
            </div>
          </div>
        </div>
      </div>

      {list.isPending ? (
        <div className="empty-card" role="status">
          <i className="fas fa-spinner fa-spin mr-1" aria-hidden="true" /> {r("loading")}
        </div>
      ) : list.isError ? (
        <div className="empty-card text-danger" role="alert">
          {r("loadFailed")}
        </div>
      ) : groups.length > 0 ? (
        <div id="workPlaceAccordion">
          {groups.map((wp, i) => {
            const wpId = `workPlaceCollapse_${i}`;
            const wpVisible = wp.banks.some((bank) =>
              bank.rows.some((row) => visible.has(row.item.id)),
            );
            const wpOpen = !collapsed.has(wpId);
            return (
              <div
                key={wp.key}
                className="mb-2 workplace-block"
                data-workplace-block
                hidden={!wpVisible}
              >
                <button
                  className="workplace-header-btn"
                  type="button"
                  aria-expanded={wpOpen}
                  aria-controls={wpId}
                  onClick={() => toggle(wpId)}
                >
                  <span>
                    <i className="fas fa-building mr-2 text-primary" aria-hidden="true" />
                    {wp.workPlaceName}
                  </span>
                  <span className="summary-badges">
                    <span className="summary-badge">{r("checkCount", { count: wp.count })}</span>
                    <span className="summary-badge currency">{wp.totalsText}</span>
                  </span>
                </button>
                <div id={wpId} className={`collapse${wpOpen ? " show" : ""} mt-2`}>
                  <div className="pl-2">
                    {wp.banks.map((bank, j) => {
                      const bankId = `bankCollapse_${i}_${j}`;
                      const bankOpen = !collapsed.has(bankId);
                      const bankVisible = bank.rows.some((row) => visible.has(row.item.id));
                      const headingId = `${bankId}_heading`;
                      return (
                        <div
                          key={bank.key}
                          className="mb-2 bank-block"
                          data-bank-block
                          hidden={!bankVisible}
                        >
                          <button
                            className="bank-header-btn"
                            type="button"
                            id={headingId}
                            aria-expanded={bankOpen}
                            aria-controls={bankId}
                            onClick={() => toggle(bankId)}
                          >
                            <span>
                              <span className="d-block">
                                <i
                                  className="fas fa-university mr-2 text-info"
                                  aria-hidden="true"
                                />
                                {bank.bankName}
                              </span>
                              <span className="bank-meta">
                                <small>
                                  <i className="fas fa-landmark mr-1" aria-hidden="true" />
                                  {bank.officialName}
                                </small>
                                <small>
                                  <i className="fas fa-code-branch mr-1" aria-hidden="true" />
                                  {bank.branchName}
                                </small>
                                <small>
                                  <i className="fas fa-credit-card mr-1" aria-hidden="true" />
                                  {bank.iban}
                                </small>
                              </span>
                            </span>
                            <span className="summary-badges">
                              <span className="summary-badge">
                                {r("checkCount", { count: bank.count })}
                              </span>
                              <span className="summary-badge currency">{bank.totalsText}</span>
                            </span>
                          </button>
                          <div id={bankId} className={`collapse${bankOpen ? " show" : ""} mt-2`}>
                            <div className="table-responsive">
                              <table
                                className="table table-sm table-bordered table-hover report-table mb-0"
                                aria-labelledby={headingId}
                              >
                                <thead>
                                  <tr>
                                    <th scope="col" style={COL_ID}>
                                      {r("colId")}
                                    </th>
                                    <th scope="col">{r("colNumber")}</th>
                                    <th scope="col">{r("colDrawer")}</th>
                                    <th scope="col">{r("colPayee")}</th>
                                    <th scope="col">{r("colIssue")}</th>
                                    <th scope="col">{r("colDue")}</th>
                                    <th scope="col">{r("colRemaining")}</th>
                                    <th scope="col">{r("colStatus")}</th>
                                    <th scope="col" style={COL_AMOUNT} className="text-right">
                                      {r("colAmount")}
                                    </th>
                                    <th scope="col">{r("colDescription")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bank.rows.map((row, k) => {
                                    const badge = dayBadge(row);
                                    const item = row.item;
                                    return (
                                      <tr
                                        key={item.id}
                                        className="report-row"
                                        hidden={!visible.has(item.id)}
                                      >
                                        <td>{k + 1}</td>
                                        <td>{item.number}</td>
                                        <td>{item.companyName}</td>
                                        <td>
                                          {item.employeeMasked ? "-" : (item.accountName ?? "-")}
                                        </td>
                                        <td>{item.issueDate ? formatDate(item.issueDate) : "-"}</td>
                                        <td>{formatDate(item.dueDate)}</td>
                                        <td>
                                          <span className={`days-badge ${badge.className}`}>
                                            <i className={`fas ${badge.icon}`} aria-hidden="true" />
                                            {t(badge.key, { count: badge.count })}
                                          </span>
                                        </td>
                                        <td>{statusText(row)}</td>
                                        <td className="text-right">
                                          {formatN2(item.money.amount)}{" "}
                                          {currencySymbol(row.currency)}
                                        </td>
                                        <td>
                                          {item.employeeMasked ? "-" : item.description || "-"}
                                        </td>
                                      </tr>
                                    );
                                  })}
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
          })}
        </div>
      ) : (
        <div className="empty-card">
          <i className="fas fa-info-circle mr-1" aria-hidden="true" />
          {r("empty")}
        </div>
      )}

      <div className="totals-footer-card">
        <div
          className="d-flex align-items-center justify-content-between flex-wrap"
          style={ACTIONS_GAP}
        >
          <div>
            <strong>
              <i className="fas fa-calculator text-primary mr-1" aria-hidden="true" />
              {r("totalsTitle")}
            </strong>
            <div className="text-muted" style={SMALL_TEXT}>
              {r("totalsSub")}
            </div>
          </div>
          <div className="text-muted" style={SMALL_TEXT}>
            {r("totalsRange", { from: fromText, to: toText })}
          </div>
        </div>
        <div className="mt-2">
          {totals.length > 0 ? (
            totals.map((total) => (
              <span key={total.currency} className="currency-total-pill">
                <i className="fas fa-coins" aria-hidden="true" />
                {formatN2(total.total)} {currencySymbol(total.currency)}
                <span className="text-muted" style={SMALL_TEXT}>
                  {r("totalsCount", { count: total.count })}
                </span>
              </span>
            ))
          ) : (
            <span className="text-muted">{r("totalsEmpty")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
