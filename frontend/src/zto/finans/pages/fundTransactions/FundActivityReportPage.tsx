import { CSSProperties, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";
import { useFundActivity } from "../../../../pages/finance/fundApi";
import type { FundKind } from "../../../../pages/finance/types";
import { currencySymbol, formatDateTime, formatN2 } from "../../../components";
import { errorMessage } from "../../../components/definitionLogic";
import { downloadBlob } from "../../../export";
import {
  activityCsv,
  activitySummary,
  defaultActivityRange,
  fifoRows,
  remainingState,
  usedPercent,
} from "./activityLogic";
import { accountingKeyOf, todayIso } from "./fundTransactionsLogic";

const SMALL: CSSProperties = { fontSize: 10 };
const DATE_IN: CSSProperties = { fontSize: 11 };
const LABEL: CSSProperties = { fontSize: 10, fontWeight: 600 };
const VALUE: CSSProperties = { fontSize: 15 };

/** dd.MM.yy (ZTO FIFO tablosu). */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y.slice(2)}` : iso;
}

/**
 * FIFO Faaliyet Raporu yazdırma sayfası (ZTO BankTransactions/ActivityReport.cshtml:417-941;
 * CashTransactions/ActivityReport.cshtml aynı, turuncu). Kabuk dışı (`zto-print
 * zto-page-fund-activity-report`). Eşleştirme sunucuda (§3.2.8). MWG: tablolarda `caption.sr-only` ve
 * `th[scope=col]`.
 */
export function FundActivityReportPage() {
  const { t } = useTranslation("ztoFinans");
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const fallback = defaultActivityRange(todayIso());
  const range = {
    from: params.get("from") || fallback.from,
    to: params.get("to") || fallback.to,
  };
  const [now] = useState(() => new Date());
  const report = useFundActivity(id, range);
  const r = (key: string, options?: Record<string, unknown>) =>
    t(`fundTransactions.report.${key}`, options);
  const data = report.data;
  const kind: FundKind = data?.fund.kind ?? "BANK";
  const bank = kind === "BANK";
  const rows = useMemo(() => (data ? fifoRows(data.inflows) : []), [data]);
  const summary = useMemo(() => (data ? activitySummary(data) : null), [data]);

  useEffect(() => {
    document.title = r(bank ? "pageTitleBank" : "pageTitleCash");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- r yalnız t'den türer
  }, [bank, t]);

  const label = (accountingType: string) => {
    const key = accountingKeyOf(kind, accountingType);
    return key ? t(`fundTransactions.accountingTypes.${key}`) : accountingType;
  };

  const exportCsv = () => {
    if (!data) return;
    const csv = activityCsv([
      {
        headers: [
          r("no"),
          r("date"),
          r("type"),
          r("accounting"),
          r("description"),
          r("amount"),
          r("remaining"),
        ],
        rows: rows.map((row) =>
          row.kind === "inflow"
            ? [
                row.id ? `#${row.no}` : r("openingRow"),
                shortDate(row.date),
                r("inType"),
                label(row.accountingType),
                row.description ?? "-",
                `+${formatN2(row.amount)}`,
                formatN2(row.remaining),
              ]
            : [
                "",
                shortDate(row.date),
                r("outType"),
                label(row.accountingType),
                row.description ?? "-",
                `-${formatN2(row.amount)}`,
                formatN2(row.remainingAfter),
              ],
        ),
      },
      {
        headers: [
          r("no"),
          r("date"),
          r("accounting"),
          r("description"),
          r("original"),
          r("remaining"),
          r("used"),
        ],
        rows: data.unspent.map((entry) => [
          `#${entry.no}`,
          shortDate(entry.date),
          label(entry.accountingType),
          entry.description ?? "-",
          formatN2(entry.original),
          formatN2(entry.remaining),
          formatN2(entry.used),
        ]),
      },
    ]);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), r("fileName"));
  };

  if (report.isPending) {
    return (
      <div className={`report-container ${bank ? "far-bank" : "far-cash"}`}>
        <p role="status" className="text-center p-3">
          {r("loading")}
        </p>
      </div>
    );
  }
  if (report.isError || !data || !summary) {
    return (
      <div className="report-container">
        <p role="alert" className="text-center p-3 text-danger">
          {r("failed", { message: errorMessage(report.error, "") })}
        </p>
      </div>
    );
  }
  const symbol = currencySymbol(data.fund.currency);
  const typeText = t(`funds.common.accountTypeDisplay.${data.fund.accountType ?? "DEMAND"}`);
  const remainingCell = (remaining: number) => {
    const state = remainingState(remaining);
    if (state === "done") {
      return (
        <span className="text-success" style={SMALL}>
          <i className="fas fa-check-circle" aria-hidden="true" />
          <span className="sr-only">{r("done")}</span>
        </span>
      );
    }
    return (
      <span
        className={state === "open" ? "text-warning" : "text-danger"}
        style={{ fontWeight: 600 }}
      >
        {formatN2(remaining)}
      </span>
    );
  };

  return (
    <div className={bank ? "far-bank" : "far-cash"}>
      <br />
      <div className="report-container">
        <div className="report-header">
          <div className="row align-items-center">
            <div className="col-md-6">
              <div className="d-flex align-items-center">
                <div className="header-icon" aria-hidden="true">
                  <i className="fas fa-exchange-alt" />
                </div>
                <div>
                  <h1 className="mb-0">{r(bank ? "headingBank" : "headingCash")}</h1>
                  <p className="mb-0" style={{ opacity: 0.9, fontSize: 12 }}>
                    {data.fund.name} {data.fund.bankBranchName ?? ""}
                  </p>
                </div>
              </div>
            </div>
            <div className="col-md-6 text-right">
              <span className="badge badge-light mr-1" style={SMALL}>
                <i className="fas fa-calendar-alt mr-1" aria-hidden="true" />
                {shortDate(data.from)} - {shortDate(data.to)}
              </span>
              <span className="badge badge-light mr-1" style={SMALL}>
                <i className="fas fa-wallet mr-1" aria-hidden="true" />
                {data.fund.currency} ({symbol})
              </span>
              <span className="badge badge-light" style={SMALL}>
                <i className="fas fa-building mr-1" aria-hidden="true" />
                {typeText}
              </span>
            </div>
          </div>
        </div>

        <div className="row mb-3 no-print">
          <div className="col-12 text-right">
            <button
              type="button"
              onClick={() => window.print()}
              className="btn btn-outline-primary"
            >
              <i className="fas fa-print mr-1" aria-hidden="true" />
              {r("print")}
            </button>{" "}
            <button type="button" onClick={exportCsv} className="btn btn-outline-success">
              <i className="fas fa-file-excel mr-1" aria-hidden="true" />
              {r("excel")}
            </button>{" "}
            <button
              type="button"
              onClick={() => window.close()}
              className="btn btn-outline-secondary"
            >
              <i className="fas fa-times mr-1" aria-hidden="true" />
              {r("close")}
            </button>
          </div>
        </div>

        <div className="row mb-3">
          {[
            {
              cls: "card-balance",
              grad: "#007bff 0%, #0056b3 100%",
              icon: "fa-wallet",
              label: r("opening"),
              value: formatN2(data.opening),
              color: "#007bff",
            },
            {
              cls: "card-income",
              grad: "#28a745 0%, #1e7e34 100%",
              icon: "fa-arrow-down",
              label: r("income"),
              value: `+${formatN2(data.totalIn)}`,
              color: "#28a745",
              sub: r("operations", { count: summary.incomeCount }),
            },
            {
              cls: "card-expense",
              grad: "#dc3545 0%, #a71d2a 100%",
              icon: "fa-arrow-up",
              label: r("expense"),
              value: `-${formatN2(data.totalOut)}`,
              color: "#dc3545",
              sub: r("operations", { count: summary.expenseCount }),
            },
            {
              cls: "card-net",
              grad: "#ffc107 0%, #e0a800 100%",
              icon: "fa-balance-scale",
              label: r("net"),
              value: formatN2(data.net),
              success: true,
              sub: formatN2(data.totalIn - data.totalOut),
            },
          ].map((card) => (
            <div key={card.cls} className="col-md-3 col-6">
              <div className={`summary-card ${card.cls}`}>
                <div className="d-flex align-items-center">
                  <div
                    className="summary-icon"
                    style={{ background: `linear-gradient(135deg, ${card.grad})` }}
                    aria-hidden="true"
                  >
                    <i className={`fas ${card.icon} text-white`} />
                  </div>
                  <div>
                    <div className="text-muted" style={LABEL}>
                      {card.label}
                    </div>
                    <div
                      className={
                        card.success ? "font-weight-bold text-success" : "font-weight-bold"
                      }
                      style={{ ...VALUE, color: card.color }}
                    >
                      {card.value}
                    </div>
                    {card.sub && <small className="text-muted">{card.sub}</small>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="summary-card">
          <h5 style={{ color: "#2c3e50" }}>
            <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />
            {r("fifoTitle")}
          </h5>
          <div className="alert alert-info">
            <i className="fas fa-info-circle mr-1" aria-hidden="true" />
            <strong>{r("fifoLabel")}</strong> {r("fifoInfo")}
          </div>
          {data.unmatchedOut > 0 && (
            <div className="alert alert-warning">
              {r("unmatched", { amount: formatN2(data.unmatchedOut) })}
            </div>
          )}
          <div
            className="table-responsive"
            role="region"
            aria-label={r("fifoCaption")}
            tabIndex={0}
          >
            <table className="fifo-table">
              <caption className="sr-only">{r("fifoCaption")}</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 60 }}>
                    {r("no")}
                  </th>
                  <th scope="col" style={{ width: 90 }}>
                    {r("date")}
                  </th>
                  <th scope="col" style={{ width: 60 }}>
                    {r("type")}
                  </th>
                  <th scope="col" style={{ width: 100 }}>
                    {r("accounting")}
                  </th>
                  <th scope="col">{r("description")}</th>
                  <th scope="col" style={{ width: 100 }} className="text-right">
                    {r("amount")}
                  </th>
                  <th scope="col" style={{ width: 100 }} className="text-right">
                    {r("remaining")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-3">
                      <i className="fas fa-inbox fa-lg text-muted" aria-hidden="true" />
                      <p className="text-muted mb-0" style={DATE_IN}>
                        {r("empty")}
                      </p>
                    </td>
                  </tr>
                )}
                {rows.map((row) =>
                  row.kind === "inflow" ? (
                    <tr key={row.key} className="income-main-row">
                      <td>
                        {row.id ? (
                          <span className="transaction-id">#{row.no}</span>
                        ) : (
                          <span
                            className="badge badge-warning"
                            style={{ fontSize: 8 }}
                            title={r("openingRow")}
                          >
                            <i className="fas fa-star" aria-hidden="true" />
                            <span className="sr-only">{r("openingRow")}</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <strong style={DATE_IN}>{shortDate(row.date)}</strong>
                      </td>
                      <td>
                        <span className="type-badge type-badge-income">
                          <i className="fas fa-arrow-down" aria-hidden="true" />
                          <span className="sr-only">{r("inType")}</span>
                        </span>
                      </td>
                      <td>
                        {row.accountingType ? (
                          <span className="account-type-badge">{label(row.accountingType)}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="description-cell">
                        {row.description || <span className="text-muted">-</span>}
                      </td>
                      <td className="amount-cell amount-income">+{formatN2(row.amount)}</td>
                      <td className="amount-cell">{remainingCell(row.remaining)}</td>
                    </tr>
                  ) : (
                    <tr key={row.key} className="expense-match-row">
                      <td className="indent-cell" />
                      <td>
                        <strong style={SMALL}>{shortDate(row.date)}</strong>
                      </td>
                      <td>
                        <span className="type-badge type-badge-expense">
                          <i className="fas fa-arrow-up" aria-hidden="true" />
                          <span className="sr-only">{r("outType")}</span>
                        </span>
                      </td>
                      <td>
                        {row.accountingType ? (
                          <span className="account-type-badge">{label(row.accountingType)}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="description-cell">
                        {row.description || <span className="text-muted">-</span>}
                      </td>
                      <td className="amount-cell amount-expense">-{formatN2(row.amount)}</td>
                      <td className="amount-cell">
                        <span className="text-muted" style={SMALL}>
                          {formatN2(row.remainingAfter)}
                        </span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>

        {data.unspent.length > 0 && (
          <div className="summary-card mt-3">
            <h5 style={{ color: "#2c3e50" }}>
              <i
                className="fas fa-piggy-bank mr-1"
                style={{ color: "#fbbf24" }}
                aria-hidden="true"
              />
              {r("unspentTitle")}
            </h5>
            <div className="row mb-2">
              <div className="col-md-4">
                <div className="stat-card stat-card-orange">
                  <h6>{r("remainingIn")}</h6>
                  <h3>{formatN2(summary.totalRemaining)}</h3>
                  <small>{r("operations", { count: summary.remainingCount })}</small>
                </div>
              </div>
              <div className="col-md-4">
                <div className="stat-card stat-card-blue">
                  <h6>{r("originalCard")}</h6>
                  <h3>{formatN2(summary.totalOriginal)}</h3>
                  <small>{r("originalSub")}</small>
                </div>
              </div>
              <div className="col-md-4">
                <div className="stat-card stat-card-green">
                  <h6>{r("balanceCard")}</h6>
                  <h3>{formatN2(data.net)}</h3>
                  <small>{r("balanceSub")}</small>
                </div>
              </div>
            </div>
            <div
              className="table-responsive"
              role="region"
              aria-label={r("unspentCaption")}
              tabIndex={0}
            >
              <table className="remaining-table">
                <caption className="sr-only">{r("unspentCaption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{r("no")}</th>
                    <th scope="col">{r("date")}</th>
                    <th scope="col">{r("accounting")}</th>
                    <th scope="col">{r("description")}</th>
                    <th scope="col" className="text-right">
                      {r("original")}
                    </th>
                    <th scope="col" className="text-right">
                      {r("remaining")}
                    </th>
                    <th scope="col" className="text-right">
                      {r("used")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.unspent.map((entry) => (
                    <tr key={entry.no}>
                      <td>
                        <span className="transaction-id">#{entry.no}</span>
                      </td>
                      <td>
                        <strong style={SMALL}>{shortDate(entry.date)}</strong>
                      </td>
                      <td>
                        {entry.accountingType ? (
                          <span className="account-type-badge">{label(entry.accountingType)}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td style={SMALL}>{entry.description ?? "-"}</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>
                        {formatN2(entry.original)}
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: "#f59e0b" }}>
                        {formatN2(entry.remaining)}
                      </td>
                      <td className="text-right">
                        {entry.used > 0 ? (
                          <>
                            <span style={SMALL}>{formatN2(entry.used)}</span>
                            <div
                              className="progress"
                              role="progressbar"
                              aria-valuenow={Math.round(usedPercent(entry))}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={r("used")}
                            >
                              <div
                                className="progress-bar bg-warning"
                                style={{ width: `${usedPercent(entry)}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: 8 }}>
                            <i className="fas fa-check" aria-hidden="true" />
                            <span className="sr-only">{r("notUsed")}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-3 text-center text-muted" style={SMALL}>
          <p className="mb-0">
            {r(bank ? "footer" : "footerCash", {
              now: formatDateTime(now),
              from: shortDate(data.from),
              to: shortDate(data.to),
              name: data.fund.name,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
