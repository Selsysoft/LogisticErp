import { CSSProperties, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useFund, useFundTransactions } from "../../../../pages/finance/fundApi";
import {
  ZtoModal,
  currencySymbol,
  formatDate,
  formatDateTime,
  formatN2,
} from "../../../components";
import { fundTransactionsPath } from "../../navItems";
import { accountingKeyOf, todayIso } from "../fundTransactions/fundTransactionsLogic";
import { signedAmountText, type BranchInfo } from "./fundsLogic";

const WRAPPER: CSSProperties = { backgroundColor: "#f8fafc", margin: -20, padding: 20 };
const BALANCE_CARD: CSSProperties = {
  background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
  border: "none",
  borderLeft: "4px solid #f59e0b",
  borderRadius: 8,
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  marginBottom: 15,
  padding: 20,
};
const ROW: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
};
const SECTION: CSSProperties = {
  background: "white",
  border: "none",
  borderRadius: 8,
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  marginBottom: 15,
  overflow: "hidden",
};
const SECTION_HEAD: CSSProperties = {
  background: "white",
  borderBottom: "2px solid #f1f5f9",
  padding: "12px 15px",
};
const H6: CSSProperties = { margin: 0, fontSize: 14, fontWeight: 600 };
const GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 15,
};
const LABEL: CSSProperties = { color: "#64748b", fontSize: 11, display: "block", marginBottom: 4 };
const VALUE: CSSProperties = { fontSize: 13 };
const TH: CSSProperties = {
  padding: 10,
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  border: "none",
};
const TD: CSSProperties = { padding: 10, fontSize: 12 };
const VIEW_ALL: CSSProperties = {
  display: "inline-block",
  background: "#f59e0b",
  color: "white",
  padding: "12px 24px",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 14,
};

export type CashDetailModalProps = {
  fundId: string | null;
  onHide: () => void;
  branches: Map<string, BranchInfo>;
  companyName: (companyId: string) => string;
  multiCompany: boolean;
};

/**
 * CI-1 Kasa Detayları (ZTO CashIntroduction/Index.cshtml:1353-1372 + _CashDetailPartial.cshtml).
 * "Son İşlemler" son 10 hareket (`fundId`, `to=bugün`, `size=10`, `from` yok — §3.2.6). "Son Erişen"
 * Blackrose'da izlenmez. MWG: bilgi modalında ilk odak "Kapat".
 */
export function CashDetailModal({
  fundId,
  onHide,
  branches,
  companyName,
  multiCompany,
}: CashDetailModalProps) {
  const { t } = useTranslation("ztoFinans");
  const closeRef = useRef<HTMLButtonElement>(null);
  const fund = useFund(fundId ?? undefined);
  const today = todayIso();
  const recent = useFundTransactions(
    { kind: "CASH", fundIds: fundId ? [fundId] : [], to: today, companyId: null },
    0,
    10,
    { enabled: !!fundId },
  );
  const c = (key: string) => t(`funds.cashDetail.${key}`);
  const data = fund.data;
  const symbol = currencySymbol(data?.currency);
  const branch = data ? branches.get(data.branchId) : undefined;
  const system = c("systemImport");
  const actor = (value: string | null | undefined) => (value && value.trim() ? value : system);

  let body;
  if (fund.isPending) {
    body = (
      <div className="text-center py-4" role="status">
        <i className="fas fa-spinner fa-spin fa-2x text-warning" aria-hidden="true" />
        <p className="mt-2">{c("loading")}</p>
      </div>
    );
  } else if (fund.isError) {
    body = (
      <div className="alert alert-danger" role="alert">
        {c("loadFailed")}
      </div>
    );
  } else if (!data) {
    body = <div className="alert alert-warning">{c("notFound")}</div>;
  } else {
    const updated = data.updateCount > 0;
    const rows = recent.data?.content ?? [];
    body = (
      <div className="cash-detail-wrapper" style={WRAPPER}>
        <div style={BALANCE_CARD}>
          <div style={ROW}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h5
                className="cash-detail-truncate"
                style={{ color: "#d97706", marginBottom: 10, fontSize: 16, fontWeight: 600 }}
                title={data.name || c("generalCash")}
              >
                <i className="fas fa-cash-register" aria-hidden="true" />{" "}
                {data.name || c("generalCash")}
              </h5>
              {data.code && (
                <span
                  style={{
                    background: "#64748b",
                    color: "white",
                    padding: "4px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                  }}
                >
                  {data.code}
                </span>
              )}
            </div>
            <div style={{ textAlign: "right", minWidth: 200 }}>
              <h3 style={{ color: "#d97706", margin: 0, fontSize: 28, fontWeight: 700 }}>
                {formatN2(data.currentBalance)} {symbol}
              </h3>
              <small style={{ color: "#64748b", fontSize: 12 }}>{c("currentBalance")}</small>
            </div>
          </div>
        </div>

        <div style={SECTION}>
          <div style={SECTION_HEAD}>
            <h6 style={H6}>
              <i className="fas fa-info-circle" style={{ color: "#3b82f6" }} aria-hidden="true" />{" "}
              {c("general")}
            </h6>
          </div>
          <div style={{ background: "white", padding: 15 }}>
            <div style={GRID}>
              <div>
                <small style={LABEL}>{c("code")}</small>
                <strong style={VALUE}>{data.code}</strong>
              </div>
              <div>
                <small style={LABEL}>{c("currency")}</small>
                <strong style={VALUE}>
                  {symbol} - {data.currency}
                </strong>
              </div>
              <div>
                <small style={LABEL}>{c("opening")}</small>
                <strong style={VALUE}>
                  {formatN2(data.openingBalance)} {symbol}
                </strong>
              </div>
              <div>
                <small style={LABEL}>{c("workPlace")}</small>
                <strong className="cash-detail-truncate" style={VALUE} title={branch?.name}>
                  {branch?.name ?? ""}
                </strong>
              </div>
              <div>
                <small style={LABEL}>{c("branch")}</small>
                <strong className="cash-detail-truncate" style={VALUE} title={branch?.groupName}>
                  {branch?.groupName ?? ""}
                </strong>
              </div>
              {multiCompany && (
                <div>
                  <small style={LABEL}>{c("company")}</small>
                  <strong style={VALUE}>{companyName(data.companyId)}</strong>
                </div>
              )}
              <div>
                <small style={LABEL}>{c("createdAt")}</small>
                <strong style={VALUE}>{formatDateTime(data.createdAt)}</strong>
              </div>
            </div>
          </div>
        </div>

        {data.description && (
          <div style={SECTION}>
            <div style={SECTION_HEAD}>
              <h6 style={H6}>
                <i className="fas fa-comment-alt" style={{ color: "#64748b" }} aria-hidden="true" />{" "}
                {c("description")}
              </h6>
            </div>
            <div style={{ background: "white", padding: 15 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#334155", overflowWrap: "anywhere" }}>
                {data.description}
              </p>
            </div>
          </div>
        )}

        <div style={{ ...SECTION, borderLeft: "4px solid #f59e0b" }}>
          <div style={SECTION_HEAD}>
            <h6 style={H6}>
              <i className="fas fa-user-shield" style={{ color: "#f59e0b" }} aria-hidden="true" />{" "}
              {c("audit")}
            </h6>
          </div>
          <div style={{ background: "white", padding: "12px 15px" }}>
            <div className="cash-audit-grid">
              <div className="cash-audit-chip">
                <span
                  className="cash-audit-icon"
                  style={{ background: "#fef3c7", color: "#d97706" }}
                >
                  <i className="fas fa-plus" aria-hidden="true" />
                </span>
                <div className="cash-audit-body">
                  <small>{c("createdBy")}</small>
                  <strong className="cash-detail-truncate" title={actor(data.createdBy)}>
                    {actor(data.createdBy)}
                  </strong>
                  <time dateTime={data.createdAt}>{formatDateTime(data.createdAt) || "-"}</time>
                </div>
              </div>
              <div className="cash-audit-chip">
                <span
                  className="cash-audit-icon"
                  style={{ background: "#fff7ed", color: "#ea580c" }}
                >
                  <i className="fas fa-pen" aria-hidden="true" />
                </span>
                <div className="cash-audit-body">
                  <small>{c("updatedBy")}</small>
                  <strong className="cash-detail-truncate">
                    {updated ? actor(data.updatedBy) : "-"}
                  </strong>
                  <time>{updated ? formatDateTime(data.updatedAt) : c("notUpdated")}</time>
                </div>
                <b className="cash-audit-count" title={c("updateCount")}>
                  {data.updateCount}
                  <span className="sr-only"> {c("updateCount")}</span>
                </b>
              </div>
              <div className="cash-audit-chip">
                <span
                  className="cash-audit-icon"
                  style={{ background: "#fefce8", color: "#ca8a04" }}
                >
                  <i className="fas fa-eye" aria-hidden="true" />
                </span>
                <div className="cash-audit-body">
                  <small>{c("lastAccess")}</small>
                  <strong className="cash-detail-truncate">-</strong>
                  <time>{c("auditUnavailable")}</time>
                </div>
              </div>
            </div>
            {data.lastTransactionDate && (
              <div className="cash-audit-financial">
                <span
                  className="cash-audit-icon"
                  style={{ background: "#fffbeb", color: "#f59e0b" }}
                >
                  <i className="fas fa-exchange-alt" aria-hidden="true" />
                </span>
                <div className="cash-audit-body">
                  <small>{c("lastFinancial")}</small>
                  <strong className="cash-detail-truncate">
                    {formatDate(data.lastTransactionDate)}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ ...SECTION, marginBottom: 0 }}>
          <div style={SECTION_HEAD}>
            <h6 style={H6} id="cashDetailRecentTitle">
              <i className="fas fa-history" style={{ color: "#3b82f6" }} aria-hidden="true" />{" "}
              {c("recent")}
            </h6>
          </div>
          <div style={{ background: "white", padding: 0 }}>
            <div
              style={{ overflowX: "auto" }}
              role="region"
              aria-labelledby="cashDetailRecentTitle"
              tabIndex={0}
            >
              {rows.length > 0 ? (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    background: "white",
                    margin: 0,
                    minWidth: 720,
                  }}
                >
                  <thead style={{ background: "#f8fafc" }}>
                    <tr>
                      {(["date", "type", "accountType"] as const).map((key) => (
                        <th key={key} scope="col" style={TH}>
                          {c(`columns.${key}`)}
                        </th>
                      ))}
                      <th scope="col" style={{ ...TH, textAlign: "right" }}>
                        {c("columns.amount")}
                      </th>
                      {(["description", "actor", "applied"] as const).map((key) => (
                        <th key={key} scope="col" style={TH}>
                          {c(`columns.${key}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const income = row.direction === "IN";
                      const key = accountingKeyOf("CASH", row.accountingType);
                      return (
                        <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ ...TD, color: "#334155", whiteSpace: "nowrap" }}>
                            <small>{formatDate(row.transactionDate)}</small>
                          </td>
                          <td style={TD}>
                            <span
                              style={{
                                background: income ? "#10b981" : "#ef4444",
                                color: "white",
                                padding: "4px 8px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                              }}
                            >
                              {c(income ? "incoming" : "outgoing")}
                            </span>
                          </td>
                          <td style={{ ...TD, color: "#64748b" }}>
                            <small>
                              {key
                                ? t(`fundTransactions.accountingTypes.${key}`)
                                : row.accountingType}
                            </small>
                          </td>
                          <td
                            style={{
                              ...TD,
                              textAlign: "right",
                              color: income ? "#10b981" : "#ef4444",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {signedAmountText(row.direction, formatN2(row.amount))}{" "}
                            {currencySymbol(row.currency)}
                          </td>
                          <td style={{ ...TD, color: "#64748b" }}>
                            <small
                              className="cash-detail-truncate"
                              style={{ maxWidth: 180 }}
                              title={row.description ?? ""}
                            >
                              {row.description || "-"}
                            </small>
                          </td>
                          <td style={{ ...TD, color: "#334155" }}>
                            <small className="cash-detail-truncate" style={{ maxWidth: 140 }}>
                              {actor(row.createdBy)}
                            </small>
                          </td>
                          <td style={{ ...TD, color: "#64748b", whiteSpace: "nowrap" }}>
                            <small>{formatDateTime(row.createdAt) || system}</small>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: "center", padding: 40, background: "white" }}>
                  <i
                    className="fas fa-inbox"
                    style={{ fontSize: 48, color: "#cbd5e1", marginBottom: 15 }}
                    aria-hidden="true"
                  />
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: 14 }}>{c("noTransactions")}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 15 }}>
          <Link
            to={fundTransactionsPath("CASH", { fundId: data.id })}
            style={VIEW_ALL}
            onClick={onHide}
          >
            <i className="fas fa-exchange-alt" aria-hidden="true" /> {c("viewAll")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ZtoModal
      show={fundId !== null}
      onHide={onHide}
      id="cashDetailModal"
      size="lg"
      headerClassName="bg-warning text-white"
      closeButtonClassName="text-white"
      title={
        <>
          <i className="fas fa-cash-register" aria-hidden="true" /> {c("title")}
        </>
      }
      bodyClassName="cash-detail-body"
      onEntered={() => closeRef.current?.focus()}
      footer={
        <button ref={closeRef} type="button" className="btn btn-secondary" onClick={onHide}>
          {c("close")}
        </button>
      }
    >
      <div id="cashDetailContent" style={{ backgroundColor: "#f8fafc", padding: 20 }}>
        {body}
      </div>
    </ZtoModal>
  );
}
