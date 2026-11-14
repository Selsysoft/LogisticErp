import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";
import { apiBlobUrl, apiGet } from "../../../../api/client";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, isMultiCompany } from "../../../../auth/companyStore";
import { fundKeys, fundStatementQuery, useFund } from "../../../../pages/finance/fundApi";
import type { FundKind, Statement } from "../../../../pages/finance/types";
import { useCompany } from "../../../../pages/organization/api";
import { useBranchTree } from "../../../branch/branchTree";
import { currencySymbol, formatDate, formatDateTime, formatN2 } from "../../../components";
import { errorMessage } from "../../../components/definitionLogic";
import { downloadBlob } from "../../../export";
import { branchIndex } from "../funds/fundsLogic";
import { collectStatement, extractCsv, extractFileName, extractModel } from "./extractLogic";
import { addDaysIso, todayIso } from "./fundTransactionsLogic";

const PAGE_STYLE_ID = "zto-fund-extract-page";

/**
 * Banka / Kasa Ekstresi yazdırma sayfası (ZTO BankStatement/BankExtract.cshtml, CashTransactions/
 * CashExtract.cshtml; 12.2 §5.10). Kabuk dışı (`zto-print zto-page-fund-extract`); başlıkta fonun
 * şirketinin adı/logosu (12.1 cari ekstre deseni; ZTO sabit fabrika adı ve filigranı yok). Veri
 * `GET /funds/{id}/statement` 200'lük sayfalarla (`totalPages` döngüsü, ≤ 10.000 satır).
 */
export function FundExtractPage({ kind = "BANK" }: { kind?: FundKind }) {
  const { t } = useTranslation("ztoFinans");
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const bank = kind === "BANK";
  const today = todayIso();
  const [draft, setDraft] = useState({
    from: params.get("from") || addDaysIso(today, -7),
    to: params.get("to") || today,
  });
  const [range, setRange] = useState(draft);
  const [rangeError, setRangeError] = useState(false);
  const [now] = useState(() => new Date());
  const me = useAuthStore((state) => state.me);
  const fund = useFund(id);
  const tree = useBranchTree();
  const branch = useMemo(() => branchIndex(tree.data), [tree.data]).get(fund.data?.branchId ?? "");
  const currency = fund.data?.currency ?? "";
  const statement = useQuery({
    queryKey: [...fundKeys.all, "extract", id, range.from, range.to],
    queryFn: () =>
      collectStatement(
        (page, size) => apiGet<Statement>(fundStatementQuery(id, range, page, size)),
        currency,
      ),
    enabled: !!id && currency !== "",
  });
  const companies = activeCompanies(me?.companies);
  const companyMeta = companies.find((c) => c.id === fund.data?.companyId);
  const company = useCompany(fund.data?.companyId);
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

  // ZTO @page { size: A4 landscape; margin: 10mm } yalnız bu rota bağlıyken (paket CSS'inde @page yok).
  useEffect(() => {
    const style = document.createElement("style");
    style.id = PAGE_STYLE_ID;
    style.textContent = "@page { size: A4 landscape; margin: 10mm; }";
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const e = (key: string, options?: Record<string, unknown>) =>
    t(`fundTransactions.extract.${key}`, options);
  useEffect(() => {
    if (fund.data)
      document.title = e(bank ? "pageTitleBank" : "pageTitleCash", { name: fund.data.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- e yalnız t'den türer
  }, [fund.data, bank, t]);

  const model = useMemo(
    () =>
      statement.data ? extractModel(statement.data.lines, statement.data.opening, currency) : null,
    [statement.data, currency],
  );
  const symbol = currencySymbol(currency);
  const data = fund.data;
  const generatedAt = formatDateTime(now);
  const companyTitle = company.data?.title ?? companyMeta?.title ?? companyMeta?.shortName ?? "";
  const multiCompany = isMultiCompany(me?.companies);
  const accountType = data
    ? t(`funds.common.accountTypeDisplay.${data.accountType ?? "DEMAND"}`)
    : "";
  const p = bank ? "bank" : "cash";

  const apply = () => {
    if (!draft.from || !draft.to) {
      setRangeError(true);
      return;
    }
    setRangeError(false);
    setRange(draft);
  };
  const downloadCsv = () => {
    if (!model || !data) return;
    const rows: string[][] = [
      [
        e("no"),
        e("colDate"),
        e("colType"),
        e("colIn"),
        e("colOut"),
        e("colBalance"),
        e("colCurrency"),
        e("colDescription"),
      ],
      [
        "—",
        formatDate(range.from),
        e("devir"),
        "",
        "",
        formatN2(model.opening),
        currency,
        `${e("openingRow")} (${formatDate(range.from)} – ${formatDate(range.to)} ${e("beforePeriod")})`,
      ],
      ...model.rows.map((row) => [
        String(row.no),
        formatDate(row.date),
        e(row.direction === "IN" ? "in" : "out"),
        row.debit > 0 ? formatN2(row.debit) : "",
        row.credit > 0 ? formatN2(row.credit) : "",
        formatN2(row.balance),
        row.currency,
        row.description,
      ]),
    ];
    const blob = new Blob([extractCsv(rows)], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, extractFileName(kind, data.code, range.from, range.to));
  };

  return (
    <div className={bank ? "fund-extract-bank" : "fund-extract-cash"}>
      <div className="print-actions">
        <div className="date-filter">
          <label htmlFor="filterStart">{e("start")}</label>
          <input
            type="date"
            id="filterStart"
            value={draft.from}
            aria-invalid={rangeError && !draft.from}
            onChange={(event) => setDraft((d) => ({ ...d, from: event.target.value }))}
            onKeyDown={(event) => event.key === "Enter" && apply()}
          />
          <label htmlFor="filterEnd">{e("end")}</label>
          <input
            type="date"
            id="filterEnd"
            value={draft.to}
            aria-invalid={rangeError && !draft.to}
            onChange={(event) => setDraft((d) => ({ ...d, to: event.target.value }))}
            onKeyDown={(event) => event.key === "Enter" && apply()}
          />
          <button type="button" className="btn btn-download" onClick={apply}>
            {e("filter")}
          </button>
        </div>
        <div className="divider" />
        <button
          type="button"
          className="btn btn-download"
          style={{ fontSize: 11 }}
          onClick={downloadCsv}
        >
          <i aria-hidden="true">&#8595;</i> {e("csv")}
        </button>
        <button
          type="button"
          className="btn btn-print"
          style={{ fontSize: 11 }}
          onClick={() => window.print()}
        >
          {e("print")}
        </button>
      </div>
      {rangeError && (
        <p
          role="alert"
          className="hide-for-print"
          style={{ textAlign: "center", color: "#b91c1c" }}
        >
          {e("rangeRequired")}
        </p>
      )}
      <br />
      <br />
      <br />
      <div className="extract-container">
        {(fund.isPending || statement.isPending) && !fund.isError && (
          <p role="status" style={{ textAlign: "center", padding: 12 }}>
            {e("loading")}
          </p>
        )}
        {(fund.isError || statement.isError) && (
          <p role="alert" style={{ textAlign: "center", padding: 12, color: "#b91c1c" }}>
            {e("failed", { message: errorMessage(fund.error ?? statement.error, "") })}
          </p>
        )}
        {statement.data?.truncated && (
          <p role="alert" style={{ textAlign: "center", padding: 8, color: "#92400e" }}>
            {e("truncated")}
          </p>
        )}
        <div className="header">
          <div className="header-top">
            <div>
              <div className="company-name">
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt=""
                    style={{ maxHeight: 40, marginRight: 8, verticalAlign: "middle" }}
                  />
                )}
                {companyTitle}
              </div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                {e(bank ? "subtitleBank" : "subtitleCash")}
              </div>
            </div>
            <div className="statement-info">
              <div>
                {e("date")} <strong>{generatedAt}</strong>
              </div>
              <div>
                {e("period")} <strong>{formatDate(range.from)}</strong> -{" "}
                <strong>{formatDate(range.to)}</strong>
              </div>
              <div>
                {e(bank ? "noBank" : "noCash")} <strong>#{data?.code ?? ""}</strong>
              </div>
            </div>
          </div>
          <div className="statement-title">
            <h1>{e(bank ? "titleBank" : "titleCash")}</h1>
            <div className="statement-subtitle">{data?.name ?? ""}</div>
            {branch?.name && (
              <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>
                {branch.name} {branch.groupName ? ` — ${branch.groupName}` : ""}
              </div>
            )}
          </div>
        </div>

        <div className={`${p}-box`}>
          <div className={`${p}-box-header`}>{e(bank ? "boxBank" : "boxCash")}</div>
          <div className={`${p}-box-content`}>
            <div className={`${p}-grid`}>
              <div>
                <div className={`${p}-row`}>
                  <div className={`${p}-label`}>{e(bank ? "bankName" : "cashName")}</div>
                  <div className={`${p}-value`}>
                    <strong>{data?.name}</strong>
                  </div>
                </div>
                {bank && data?.bankName && (
                  <div className="bank-row">
                    <div className="bank-label">{e("bankBrand")}</div>
                    <div className="bank-value">{data.bankName}</div>
                  </div>
                )}
                <div className={`${p}-row`}>
                  <div className={`${p}-label`}>{e(bank ? "accountCode" : "cashCode")}</div>
                  <div className={`${p}-value`}>{data?.code}</div>
                </div>
                {bank && data?.iban && (
                  <div className="bank-row">
                    <div className="bank-label">{e("iban")}</div>
                    <div
                      className="bank-value"
                      style={{ fontFamily: "'Courier New',monospace", letterSpacing: 1 }}
                    >
                      {data.iban}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <div className={`${p}-row`}>
                  <div className={`${p}-label`}>{e("workPlace")}</div>
                  <div className={`${p}-value`}>{branch?.name ?? ""}</div>
                </div>
                {branch?.groupName && (
                  <div className={`${p}-row`}>
                    <div className={`${p}-label`}>{e("branch")}</div>
                    <div className={`${p}-value`}>{branch.groupName}</div>
                  </div>
                )}
                {multiCompany && (
                  <div className={`${p}-row`}>
                    <div className={`${p}-label`}>{e("company")}</div>
                    <div className={`${p}-value`}>{companyMeta?.shortName ?? ""}</div>
                  </div>
                )}
                <div className={`${p}-row`}>
                  <div className={`${p}-label`}>{e("currency")}</div>
                  <div className={`${p}-value`}>
                    <strong>{symbol}</strong> — {currency}
                  </div>
                </div>
                {bank && (
                  <div className="bank-row">
                    <div className="bank-label">{e("accountType")}</div>
                    <div className="bank-value">{accountType}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <table className="transactions-table" id="extractTable">
          <caption className="sr-only">{e("caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className="col-no">
                {e("no")}
              </th>
              <th scope="col" className="col-date">
                {e("colDate")}
              </th>
              <th scope="col" className="col-type">
                {e("colType")}
              </th>
              <th scope="col" className="col-debit">
                {e("colIn")}
              </th>
              <th scope="col" className="col-credit">
                {e("colOut")}
              </th>
              <th scope="col" className="col-balance">
                {e("colBalance")}
              </th>
              <th scope="col" className="col-currency">
                {e("colCurrency")}
              </th>
              <th scope="col" className="col-desc">
                {e("colDescription")}
              </th>
            </tr>
          </thead>
          <tbody>
            {model && (
              <tr className="opening-row">
                <td className="col-no">—</td>
                <td className="col-date">{formatDate(range.from)}</td>
                <td className="col-type">
                  <span className="type-badge type-opening">{e("devir")}</span>
                </td>
                <td className="col-debit" />
                <td className="col-credit" />
                <td
                  className={`col-balance ${model.opening >= 0 ? "col-balance-positive" : "col-balance-negative"}`}
                >
                  {formatN2(model.opening)}
                </td>
                <td className="col-currency">{currency}</td>
                <td className="col-desc" style={{ fontSize: 10 }}>
                  <strong>{e("openingRow")}</strong> ({formatDate(range.from)} –{" "}
                  {formatDate(range.to)} {e("beforePeriod")})
                </td>
              </tr>
            )}
            {model?.rows.map((row) => (
              <tr key={row.key}>
                <td className="col-no">{row.no}</td>
                <td className="col-date">{formatDate(row.date)}</td>
                <td className="col-type">
                  <span className={`type-badge ${row.direction === "IN" ? "type-in" : "type-out"}`}>
                    {e(row.direction === "IN" ? "in" : "out")}
                    {row.reversal ? ` (${e("reversed")})` : ""}
                  </span>
                </td>
                <td className="col-debit">
                  {row.debit > 0 && <span className="col-debit-val">{formatN2(row.debit)}</span>}
                </td>
                <td className="col-credit">
                  {row.credit > 0 && <span className="col-credit-val">{formatN2(row.credit)}</span>}
                </td>
                <td
                  className={`col-balance ${row.balance >= 0 ? "col-balance-positive" : "col-balance-negative"}`}
                >
                  {formatN2(row.balance)}
                </td>
                <td className="col-currency">{row.currency}</td>
                <td className="col-desc" style={{ fontSize: 10 }}>
                  {row.description}
                </td>
              </tr>
            ))}
            {model && model.rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 20, color: "#666" }}>
                  {e("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {model && (
          <div className="summary-section">
            <div className="summary-header">{e("summary")}</div>
            <div className="summary-content">
              <table className="summary-table">
                <tbody>
                  <tr>
                    <td className="label">{e("opening")}</td>
                    <td
                      className={`value ${model.opening >= 0 ? "value-positive" : "value-negative"}`}
                    >
                      {formatN2(model.opening)} {symbol}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">{e("totalIn")}</td>
                    <td className="value value-positive">
                      + {formatN2(model.totalIn)} {symbol}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">{e("totalOut")}</td>
                    <td className="value value-negative">
                      - {formatN2(model.totalOut)} {symbol}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">{e("count")}</td>
                    <td className="value" style={{ color: "#333" }}>
                      {e("countValue", { count: model.count })}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">{e("closing")}</td>
                    <td
                      className={`value ${model.closing >= 0 ? "value-positive" : "value-negative"}`}
                    >
                      {formatN2(model.closing)} {symbol}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data && data.futureCount > 0 && (
          <div
            style={{
              marginTop: 10,
              background: "#fef3c7",
              border: "1px solid #fde68a",
              borderLeft: "4px solid #f59e0b",
              borderRadius: 6,
              padding: "9px 12px",
              fontSize: 11,
              color: "#78350f",
              lineHeight: 1.55,
            }}
          >
            <strong>{e("futureTitle")}</strong>
            <br />
            {e("future", { count: data.futureCount, net: `${formatN2(data.futureNet)} ${symbol}` })}
            <br />
            {e("futureNote")}
          </div>
        )}

        <div className="legend">
          <div className="legend-title">{e("legendTitle")}</div>
          <div>
            <strong>{e("in")}</strong> {e(bank ? "legendIn" : "legendInCash")} &nbsp;|&nbsp;{" "}
            <strong>{e("out")}</strong> {e(bank ? "legendOut" : "legendOutCash")} &nbsp;|&nbsp;{" "}
            <strong>{e("colBalance")}</strong> {e("legendBalance")}
          </div>
        </div>

        <div className="footer">
          <div>
            {e("footer", { date: generatedAt })} &nbsp;|&nbsp; {e("period")}{" "}
            {formatDate(range.from)} – {formatDate(range.to)}
          </div>
          <div>
            {companyTitle} — {e(bank ? "footerSystemBank" : "footerSystemCash")}
          </div>
        </div>
      </div>
    </div>
  );
}
