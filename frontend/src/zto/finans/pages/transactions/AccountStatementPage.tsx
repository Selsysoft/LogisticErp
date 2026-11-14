import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";
import { apiBlobUrl } from "../../../../api/client";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, isMultiCompany } from "../../../../auth/companyStore";
import {
  useAccount,
  useAccountInvoices,
  useAccountStatement,
} from "../../../../pages/finance/accountApi";
import { useBranches } from "../../../../pages/finance/common";
import type { AccountInvoiceRow, StatementDateBasis } from "../../../../pages/finance/types";
import { useCompany } from "../../../../pages/organization/api";
import { currencySymbol, formatDate, formatDateTime, formatN2 } from "../../../components";
import {
  balanceMark,
  groupStatement,
  groupStatementChunked,
  periodLabel,
  showsDetailToggle,
  statementNo,
  type StatementModel,
} from "./statementLogic";

const PAGE_STYLE_ID = "zto-account-statement-page";
/** Açık aralık sınırları (§3.7 `accountId`'li sorgu sözleşmesi, sunucu MIN_DATE/MAX_DATE). */
const STATEMENT_OPEN_FROM = "0001-01-01";
const STATEMENT_OPEN_TO = "9999-12-31";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Yerel (Europe/Istanbul tarayıcı saati) "yyyy-MM-dd" ve "HH:mm:ss". */
function nowParts(date: Date) {
  return {
    iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  };
}

/**
 * Hesap Ekstresi yazdırma sayfası (ZTO AccountTransaction/Statement.cshtml + _CurrencyStatementPartial;
 * 12.1 §5.11). Uygulama kabuğu dışında (`ZtoFinansRoot className="zto-print zto-page-account-statement"`).
 * Başlıkta seçili (yoksa varsayılan) şirketin adı/logosu; ZTO'nun sabit "ZTO FABRİKA" metni ve filigranı
 * yok. Gruplama ve yürüyen bakiye istemcide 50 ms parçalarla (statementLogic, MWG break-up-long-tasks).
 */
export function AccountStatementPage() {
  const { t } = useTranslation("ztoFinans");
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const me = useAuthStore((s) => s.me);
  const companies = activeCompanies(me?.companies);
  const multiCompany = isMultiCompany(me?.companies);

  const [startDate, setStartDate] = useState(params.get("from") ?? "");
  const [endDate, setEndDate] = useState(params.get("to") ?? "");
  const [range, setRange] = useState({
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  });
  const [basis, setBasis] = useState<StatementDateBasis>(
    params.get("dateBasis") === "DOCUMENT" ? "DOCUMENT" : "TRANSACTION",
  );
  const [branchId, setBranchId] = useState(params.get("branchId") ?? "");
  const [companyId, setCompanyId] = useState(params.get("companyId") ?? "");
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [detailed, setDetailed] = useState(false);
  const [model, setModel] = useState<StatementModel | null>(null);
  const [now] = useState(() => new Date());

  const account = useAccount(id);
  const branches = useBranches();
  // Sunucu `from` ve `to`'yu zorunlu ister (§4.5). Kullanıcının başlangıç tarihi istemcide uygulanır
  // (iş yeri × para birimi devreden bakiyesi için tüm geçmiş gerekir, ZTO applyStatementDateFilter
  // gibi); bu yüzden `from` her zaman açık aralık başıdır. Boş `to` ("Tüm Zamanlar") ileri tarihli
  // hareketleri de kapsar (§3.7 açık aralık sözleşmesi).
  const statement = useAccountStatement(id, {
    from: STATEMENT_OPEN_FROM,
    to: range.to || STATEMENT_OPEN_TO,
    dateBasis: basis,
    companyId: companyId || null,
  });
  const detailOn = detailed && showsDetailToggle(account.data?.subGroup);
  const purchase = useAccountInvoices(detailOn ? id : undefined, {
    direction: "PURCHASE",
    companyId: companyId || null,
  });
  const sales = useAccountInvoices(detailOn ? id : undefined, {
    direction: "SALES",
    companyId: companyId || null,
  });
  const documents = useMemo(() => {
    const map = new Map<string, AccountInvoiceRow>();
    for (const r of [...(purchase.data ?? []), ...(sales.data ?? [])])
      if (r.kind === "ACCOUNT_DOCUMENT") map.set(r.id, r);
    return map;
  }, [purchase.data, sales.data]);

  const selectedCompany =
    companies.find((c) => c.id === companyId) ??
    companies.find((c) => c.defaultCompany) ??
    companies[0];
  const company = useCompany(selectedCompany?.id);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    const fileId = company.data?.logoFileId;
    if (!fileId) {
      setLogoUrl(null);
      return;
    }
    let revoked = false;
    let url: string | null = null;
    apiBlobUrl(`/files/${fileId}/content`)
      .then((u) => {
        url = u;
        if (!revoked) setLogoUrl(u);
      })
      .catch(() => setLogoUrl(null));
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [company.data?.logoFileId]);

  // ZTO @page { size: A4; margin: 10mm } yalnız bu rota bağlıyken (CSS paketinde @page kalamaz).
  useEffect(() => {
    const style = document.createElement("style");
    style.id = PAGE_STYLE_ID;
    style.textContent = "@page { size: A4; margin: 10mm; }";
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    if (account.data)
      document.title = t("transactions.statement.documentTitle", { name: account.data.name });
  }, [account.data, t]);

  const branchName = useMemo(() => {
    const names = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
    return (bid: string) => names.get(bid) ?? t("transactions.statement.unknownWorkplace");
  }, [branches.data, t]);

  // Uzun görev: gruplama + yürüyen bakiye 50 ms parçalarla; süzgeç değişince öncekini iptal eder.
  const lines = statement.data?.lines;
  const options = useMemo(
    () => ({
      from: range.from || undefined,
      to: range.to || undefined,
      dateBasis: basis,
      branchId: branchId || undefined,
      branchName,
    }),
    [range, basis, branchId, branchName],
  );
  useEffect(() => {
    if (!lines) return;
    const controller = new AbortController();
    setModel(null);
    groupStatementChunked(lines, options, undefined, { signal: controller.signal })
      .then((m) => {
        if (!controller.signal.aborted) setModel(m);
      })
      .catch(() => {
        if (!controller.signal.aborted) setModel(groupStatement(lines, options));
      });
    return () => controller.abort();
  }, [lines, options]);

  const busy = statement.isPending || (lines !== undefined && model === null);
  const a = account.data;
  const parts = nowParts(now);
  const issuer = me ? `${me.fullName}${me.roles?.[0] ? ` (${me.roles[0]})` : ""}` : "";
  const visibleCurrency = (currency: string) => !hidden.has(currency);

  return (
    <>
      <div className="print-actions" aria-busy={busy}>
        <div
          className="balance-date-filter"
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <span style={{ fontSize: 11, fontWeight: "bold", marginRight: 4 }} id="stmtRangeLabel">
            {t("transactions.statement.dateRange")}:
          </span>
          <input
            type="date"
            id="stmtStartDate"
            style={{ fontSize: 11, padding: "2px 4px" }}
            title={t("transactions.statement.start")}
            aria-label={t("transactions.statement.start")}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span style={{ fontSize: 11 }} aria-hidden="true">
            -
          </span>
          <input
            type="date"
            id="stmtEndDate"
            style={{ fontSize: 11, padding: "2px 4px" }}
            title={t("transactions.statement.end")}
            aria-label={t("transactions.statement.end")}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            style={{
              fontSize: 11,
              padding: "2px 8px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
            onClick={() => setRange({ from: startDate, to: endDate })}
          >
            {t("transactions.statement.apply")}
          </button>
          <button
            type="button"
            className="btn"
            style={{
              fontSize: 11,
              padding: "2px 8px",
              background: "#e2e8f0",
              color: "#334155",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
            title={t("transactions.statement.allTime")}
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setRange({ from: "", to: "" });
            }}
          >
            {t("transactions.statement.allTime")}
          </button>
        </div>
        <div className="divider" />
        <div className="balance-calc-filter">
          <label
            htmlFor="balanceCalcMode"
            style={{ fontSize: 11, fontWeight: "bold", marginRight: 8 }}
          >
            {t("transactions.statement.balanceCalc")}:
          </label>
          <select
            id="balanceCalcMode"
            value={basis === "DOCUMENT" ? "inv" : "tx"}
            onChange={(e) => setBasis(e.target.value === "inv" ? "DOCUMENT" : "TRANSACTION")}
          >
            <option value="tx">{t("transactions.statement.byTransaction")}</option>
            <option value="inv">{t("transactions.statement.byInvoice")}</option>
          </select>
        </div>
        <div className="divider" />
        <div className="workplace-filter">
          <label
            htmlFor="workplaceFilter"
            style={{ fontSize: 11, fontWeight: "bold", marginRight: 8 }}
          >
            {t("transactions.statement.workplace")}:
          </label>
          <select
            id="workplaceFilter"
            value={branchId || "all"}
            onChange={(e) => setBranchId(e.target.value === "all" ? "" : e.target.value)}
          >
            <option value="all">{t("transactions.statement.all")}</option>
            {(model?.allBranches ?? (branchId ? [branchId] : [])).map((bid) => (
              <option key={bid} value={bid}>
                {branchName(bid)}
              </option>
            ))}
          </select>
        </div>
        {multiCompany && (
          <>
            <div className="divider" />
            <div className="workplace-filter">
              <label
                htmlFor="companyFilter"
                style={{ fontSize: 11, fontWeight: "bold", marginRight: 8 }}
              >
                {t("transactions.statement.company")}:
              </label>
              <select
                id="companyFilter"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
              >
                <option value="">{t("transactions.statement.all")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.shortName}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="divider" />
        <div className="currency-filter" role="group" aria-labelledby="stmtCurrencyLabel">
          <span id="stmtCurrencyLabel" style={{ fontSize: 11, fontWeight: "bold", marginRight: 8 }}>
            {t("transactions.statement.currencies")}:
          </span>
          {(model?.allCurrencies ?? []).map((c) => (
            <label className="currency-checkbox" key={c}>
              <input
                type="checkbox"
                className="currency-toggle"
                data-currency-id={c}
                checked={visibleCurrency(c)}
                onChange={(e) =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (e.target.checked) next.delete(c);
                    else next.add(c);
                    return next;
                  })
                }
              />
              <span>{currencySymbol(c)}</span>
            </label>
          ))}
        </div>
        <div className="divider" />
        {a && showsDetailToggle(a.subGroup) && (
          <>
            <div className="detail-toggle-inline">
              <span
                className={detailed ? "toggle-text inactive" : "toggle-text active"}
                id="labelDetaysiz"
              >
                {t("transactions.statement.plain")}
              </span>
              <label className="toggle-switch-small">
                <input
                  type="checkbox"
                  id="detailToggle"
                  role="switch"
                  aria-checked={detailed}
                  aria-labelledby="labelDetayli"
                  checked={detailed}
                  onChange={(e) => setDetailed(e.target.checked)}
                />
                <span className="toggle-slider-small" />
              </label>
              <span
                className={detailed ? "toggle-text active" : "toggle-text inactive"}
                id="labelDetayli"
              >
                {t("transactions.statement.detailed")}
              </span>
            </div>
            <div className="divider" />
          </>
        )}
        <button
          className="btn btn-print"
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => globalThis.print()}
        >
          {t("transactions.statement.print")}
        </button>
      </div>

      <div className="statement-container">
        {busy && (
          <p role="status" style={{ textAlign: "center", padding: 12 }} className="hide-for-print">
            {t("transactions.statement.loading")}
          </p>
        )}
        {(statement.isError || account.isError) && (
          <p role="alert" style={{ textAlign: "center", padding: 12, color: "#b91c1c" }}>
            {t("transactions.statement.error")}
          </p>
        )}
        <div className="header">
          <div className="header-top">
            <div className="company-name">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  style={{ maxHeight: 40, marginRight: 8, verticalAlign: "middle" }}
                />
              )}
              {company.data?.title ?? selectedCompany?.title ?? selectedCompany?.shortName ?? ""}
            </div>
            <div className="statement-info">
              <div>
                {t("transactions.statement.statementNo")}:{" "}
                <strong>{a ? statementNo(a.code, parts.iso) : ""}</strong>
              </div>
              <div>
                {t("transactions.statement.date")}: <strong>{formatDate(parts.iso)}</strong>
              </div>
              <div>
                {t("transactions.statement.time")}: <strong>{parts.time}</strong>
              </div>
            </div>
          </div>
          <div className="statement-title">
            <h1>{t("transactions.statement.heading")}</h1>
            <div className="statement-subtitle">( {a?.subGroupName ?? ""} )</div>
            <div className="statement-period" id="stmtPeriodLabel">
              {periodLabel(
                range.from || undefined,
                range.to || undefined,
                t("transactions.statement.allTime"),
              )}
            </div>
          </div>
        </div>

        <div className="account-box">
          <div className="account-box-header">{t("transactions.statement.accountInfo")}</div>
          <div className="account-box-content">
            <div className="account-grid">
              <div>
                <div className="account-row">
                  <span className="account-label">{t("transactions.statement.code")}:</span>
                  <span className="account-value">
                    <strong>{a?.code}</strong>
                  </span>
                </div>
                <div className="account-row">
                  <span className="account-label">{t("transactions.statement.name")}:</span>
                  <span className="account-value">
                    <strong>{a?.name}</strong>
                  </span>
                </div>
                <div className="account-row">
                  <span className="account-label">{t("transactions.statement.group")}:</span>
                  <span className="account-value">{a?.subGroupName}</span>
                </div>
              </div>
              <div>
                {a?.taxNumber && (
                  <div className="account-row">
                    <span className="account-label">{t("transactions.statement.taxNumber")}:</span>
                    <span className="account-value">{a.taxNumber}</span>
                  </div>
                )}
                {a?.taxOffice && (
                  <div className="account-row">
                    <span className="account-label">{t("transactions.statement.taxOffice")}:</span>
                    <span className="account-value">{a.taxOffice}</span>
                  </div>
                )}
                {a?.phone && (
                  <div className="account-row">
                    <span className="account-label">{t("transactions.statement.phone")}:</span>
                    <span className="account-value">{a.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {model?.workplaces.map((wp) => (
          <div className="workplace-section" data-workplace-id={wp.branchId} key={wp.branchId}>
            <div className="workplace-header">
              <h2>📍 {wp.branchName}</h2>
            </div>
            {wp.currencies
              .filter((c) => visibleCurrency(c.currency))
              .map((c) => {
                const net = c.balance;
                const mark = balanceMark(net);
                const sym = currencySymbol(c.currency);
                return (
                  <div
                    className="currency-section"
                    data-currency-id={c.currency}
                    data-workplace-id={wp.branchId}
                    key={c.key}
                  >
                    <div className="currency-header">
                      <h2>
                        {t("transactions.statement.currencyStatement", { currency: c.currency })}
                      </h2>
                      <div className="currency-badge">{sym}</div>
                    </div>
                    <table className="transactions-table">
                      <caption className="sr-only">
                        {t("translation:common.a11y.statementCaption", {
                          branch: wp.branchName,
                          currency: c.currency,
                        })}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className="col-no">
                            {t("transactions.statement.colNo")}
                          </th>
                          <th scope="col" className="col-date">
                            {t("transactions.statement.colDate")}
                          </th>
                          <th scope="col" className="col-date">
                            {t("transactions.statement.colInvoiceDate")}
                          </th>
                          <th scope="col" className="col-type">
                            {t("transactions.statement.colType")}
                          </th>
                          <th scope="col" className="col-doc">
                            {t("transactions.statement.colDoc")}
                          </th>
                          <th scope="col" className="col-desc">
                            {t("transactions.statement.colDesc")}
                          </th>
                          <th scope="col" className="col-amount">
                            {t("transactions.statement.colDebit")}
                          </th>
                          <th scope="col" className="col-amount">
                            {t("transactions.statement.colCredit")}
                          </th>
                          <th scope="col" className="col-balance">
                            {t("transactions.statement.colBalance")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.opening !== null && (
                          <tr className="opening-balance-row">
                            <td
                              colSpan={6}
                              style={{
                                textAlign: "right",
                                fontWeight: "bold",
                                background: "#eef2ff",
                              }}
                            >
                              {t("transactions.statement.opening")}
                              <span style={{ fontWeight: "normal", color: "#475569" }}>
                                {" "}
                                (… - {formatDate(range.from)})
                              </span>
                            </td>
                            <td style={{ background: "#eef2ff" }} />
                            <td style={{ background: "#eef2ff" }} />
                            <td
                              className="col-balance"
                              style={{ fontWeight: "bold", background: "#eef2ff" }}
                            >
                              {formatN2(Math.abs(c.opening))} {balanceMark(c.opening)}
                            </td>
                          </tr>
                        )}
                        {c.rows.flatMap((r) => {
                          const doc =
                            detailOn && r.line.sourceType === "ACCOUNT_DOCUMENT"
                              ? documents.get(r.line.sourceId)
                              : undefined;
                          const main = (
                            <tr className={doc ? "has-detail" : undefined} key={r.line.id}>
                              <td className="col-no">
                                {r.no} {doc && <span className="detail-indicator" />}
                              </td>
                              <td className="col-date">{formatDate(r.line.date)}</td>
                              <td className="col-date">
                                {r.invoiceDate ? formatDate(r.invoiceDate) : "-"}
                              </td>
                              <td className="col-type">
                                {t(`transactions.kind.${r.line.kind as "DEBT"}`, {
                                  defaultValue: r.line.kind,
                                })}
                              </td>
                              <td className="col-doc">{r.line.documentNo || "-"}</td>
                              <td className="col-desc">{r.line.description || "-"}</td>
                              <td className="col-amount">{r.debit > 0 ? formatN2(r.debit) : ""}</td>
                              <td className="col-amount">
                                {r.credit > 0 ? formatN2(r.credit) : ""}
                              </td>
                              <td className="col-balance statement-balance-cell">
                                {formatN2(Math.abs(r.balance))} {balanceMark(r.balance)}
                              </td>
                            </tr>
                          );
                          if (!doc) return [main];
                          return [
                            main,
                            <tr className="detail-row show" key={`${r.line.id}-d`}>
                              <td colSpan={9}>
                                <div className="detail-container">
                                  <div className="detail-header">
                                    {t("transactions.statement.taxDetail")}
                                  </div>
                                  <table className="detail-table">
                                    <thead>
                                      <tr>
                                        <th scope="col" className="text-right">
                                          {t("transactions.statement.taxExcl")}
                                        </th>
                                        <th scope="col" className="text-right">
                                          {t("transactions.statement.taxVat")}
                                        </th>
                                        <th scope="col" className="text-right">
                                          {t("transactions.statement.taxWithholding")}
                                        </th>
                                        <th scope="col" className="text-right">
                                          {t("transactions.statement.taxNet")}
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td className="text-right">{formatN2(doc.netAmount)}</td>
                                        <td className="text-right">{formatN2(doc.vatAmount)}</td>
                                        <td className="text-right">
                                          {formatN2(doc.withholdingAmount)}
                                        </td>
                                        <td className="text-right">{formatN2(doc.totalAmount)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>,
                          ];
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="statement-total-row">
                          <td colSpan={6} className="stl-label">
                            {t("transactions.statement.total", { currency: sym })}
                          </td>
                          <td className="col-amount stl-borc">{formatN2(c.totalDebit)}</td>
                          <td className="col-amount stl-alacak">{formatN2(c.totalCredit)}</td>
                          <td className="col-balance stl-balance">
                            {formatN2(Math.abs(net))} {mark}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    <div className="summary-section">
                      <div className="summary-header">
                        {t("transactions.statement.currencySummary", { currency: c.currency })}
                      </div>
                      <div className="summary-content">
                        <table className="summary-table">
                          <tbody>
                            <tr>
                              <td className="label">{t("transactions.statement.debitTotal")}:</td>
                              <td className="value alacak">
                                {formatN2(c.totalDebit)} {sym}
                              </td>
                            </tr>
                            <tr>
                              <td className="label">{t("transactions.statement.creditTotal")}:</td>
                              <td className="value borc">
                                {formatN2(c.totalCredit)} {sym}
                              </td>
                            </tr>
                            <tr>
                              <td className="label">
                                {t("transactions.statement.balance")} (
                                {t(
                                  mark === "A"
                                    ? "transactions.statement.balanceCredit"
                                    : "transactions.statement.balanceDebit",
                                )}
                                ):
                              </td>
                              <td className={`value ${mark === "A" ? "borc" : "alacak"}`}>
                                {formatN2(Math.abs(net))} {sym} {mark}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ))}

        {model && model.workplaces.length === 0 && (
          <p role="status" style={{ textAlign: "center", padding: 12 }}>
            {t("transactions.statement.empty")}
          </p>
        )}

        <div className="grand-summary">
          <div className="grand-summary-header">{t("transactions.statement.grandTitle")}</div>
          <div className="grand-summary-content">
            <table className="grand-summary-table">
              <thead>
                <tr>
                  <th scope="col">{t("transactions.statement.grandWorkplace")}</th>
                  <th scope="col">{t("transactions.statement.grandCurrency")}</th>
                  <th scope="col">{t("transactions.statement.debitTotal")}</th>
                  <th scope="col">{t("transactions.statement.creditTotal")}</th>
                  <th scope="col">{t("transactions.statement.balance")}</th>
                  <th scope="col">{t("transactions.statement.grandStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {(model?.summary ?? [])
                  .filter((s) => visibleCurrency(s.currency))
                  .map((s) => (
                    <tr
                      data-workplace-id={s.branchId}
                      data-currency-id={s.currency}
                      key={`${s.branchId}|${s.currency}`}
                    >
                      <td>{s.branchName}</td>
                      <td>{`${s.currency} (${currencySymbol(s.currency)})`}</td>
                      <td className="alacak">{`${formatN2(s.debit)} ${currencySymbol(s.currency)}`}</td>
                      <td className="borc">{`${formatN2(s.credit)} ${currencySymbol(s.currency)}`}</td>
                      <td
                        className={s.balance >= 0 ? "alacak" : "borc"}
                      >{`${formatN2(Math.abs(s.balance))} ${currencySymbol(s.currency)}`}</td>
                      <td style={{ textAlign: "center", fontWeight: "bold" }}>
                        {t(
                          s.balance >= 0
                            ? "transactions.statement.debtorUpper"
                            : "transactions.statement.creditorUpper",
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                {(model?.grand ?? [])
                  .filter((g) => visibleCurrency(g.currency))
                  .map((g) => (
                    <tr
                      key={g.currency}
                      style={{
                        fontWeight: "bold",
                        background: "#f1f5f9",
                        borderTop: "2px solid #94a3b8",
                        textAlign: "right",
                      }}
                    >
                      <td style={{ textAlign: "center" }}>
                        {t("transactions.statement.grandTotal")}
                      </td>
                      <td
                        style={{ textAlign: "center" }}
                      >{`${g.currency} (${currencySymbol(g.currency)})`}</td>
                      <td
                        className="alacak"
                        style={{ textAlign: "right" }}
                      >{`${formatN2(g.debit)} ${currencySymbol(g.currency)}`}</td>
                      <td
                        className="borc"
                        style={{ textAlign: "right" }}
                      >{`${formatN2(g.credit)} ${currencySymbol(g.currency)}`}</td>
                      <td
                        className={g.balance >= 0 ? "alacak" : "borc"}
                        style={{ textAlign: "right" }}
                      >{`${formatN2(Math.abs(g.balance))} ${currencySymbol(g.currency)}`}</td>
                      <td style={{ textAlign: "center", fontWeight: "bold" }}>
                        {t(
                          g.balance >= 0
                            ? "transactions.statement.debtorUpper"
                            : "transactions.statement.creditorUpper",
                        )}
                      </td>
                    </tr>
                  ))}
              </tfoot>
            </table>
          </div>
        </div>

        <div className="legend">
          <div className="legend-title">{t("transactions.statement.legendTitle")}:</div>
          <div>
            <Trans t={t} i18nKey="transactions.statement.legend" components={{ b: <strong /> }} />
          </div>
          {issuer && (
            <div style={{ marginTop: 6 }}>
              <Trans
                t={t}
                i18nKey="transactions.statement.issuedBy"
                values={{ user: issuer }}
                components={{ b: <strong /> }}
              />
            </div>
          )}
        </div>

        <div className="footer">
          <div>
            {t("transactions.statement.footerCreated", {
              date: `${formatDateTime(now)}:${pad(now.getSeconds())}`,
            })}
          </div>
          <div>
            {t("transactions.statement.footerSystem", {
              company: selectedCompany?.shortName ?? "",
            })}
          </div>
        </div>
      </div>
    </>
  );
}
