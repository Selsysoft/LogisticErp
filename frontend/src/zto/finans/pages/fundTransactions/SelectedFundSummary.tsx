import { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { FundDetail, FundKind, FundTransactionSummary } from "../../../../pages/finance/types";
import { currencySymbol, formatN2 } from "../../../components";

export type SelectedFundSummaryProps = {
  kind: FundKind;
  fund: FundDetail;
  workPlaceName: string;
  summary: FundTransactionSummary | null | undefined;
  /** Süzgeçteki kayıt sayısı (sunucu `totalElements`). */
  filteredCount: number;
};

const THEME: Record<FundKind, { border: string; bg: string; icon: string; grad: string }> = {
  BANK: {
    border: "#3b82f6",
    bg: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
    icon: "fa-university",
    grad: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
  },
  CASH: {
    border: "#f59e0b",
    bg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
    icon: "fa-cash-register",
    grad: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  },
};
const MINI: CSSProperties = { padding: "4px 2px" };
const MINI_LABEL: CSSProperties = { fontSize: 8, color: "#64748b", margin: "2px 0" };
const MINI_VALUE: CSSProperties = { fontSize: 11, fontWeight: 700 };
const MINI_ICON: CSSProperties = { fontSize: 12 };
const BIG: CSSProperties = { fontSize: 15, fontWeight: 700, lineHeight: 1 };
const BOX_LABEL: CSSProperties = {
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: 0.3,
  marginBottom: 3,
};

/**
 * Seçili banka/kasa özeti (ZTO BankTransactions/Index.cshtml:858-985 `updateBankCard`; 12.2 §5.9).
 * Başlangıç = dönem başı (`periodOpening`), Giriş/Çıkış/Net süzgeçten; "FİLTRELENEN" = dönem başı + net
 * (ZTO B6 düzeltmesi), "GÜNCEL BAKİYE" = fonun bugünkü bakiyesi. İleri tarihli uyarı gerçekten
 * gösterilir (ZTO B5).
 */
export function SelectedFundSummary({
  kind,
  fund,
  workPlaceName,
  summary,
  filteredCount,
}: SelectedFundSummaryProps) {
  const { t } = useTranslation("ztoFinans");
  const theme = THEME[kind];
  const symbol = currencySymbol(fund.currency);
  const totals = summary?.currencies.find((c) => c.currency === fund.currency);
  const income = totals?.totalIn ?? 0;
  const expense = totals?.totalOut ?? 0;
  const net = totals?.net ?? income - expense;
  const opening = summary?.periodOpening ?? 0;
  const closing = summary?.periodClosing ?? opening + net;
  const s = (key: string, options?: Record<string, unknown>) =>
    t(`fundTransactions.summary.${key}`, options);
  const typeText = t(`funds.common.accountTypes.${fund.accountType ?? "DEMAND"}`);

  return (
    <div id={kind === "BANK" ? "selectedBankCard" : "selectedCashCard"} className="mb-3">
      <div className="selected-bank-summary">
        <div
          className="card"
          style={{ border: `2px solid ${theme.border}`, borderRadius: 10, background: theme.bg }}
        >
          <div className="card-body" style={{ padding: "10px 15px" }}>
            <div className="row align-items-center g-2">
              <div className="col-md-3 col-12 mb-2 mb-md-0">
                <div className="d-flex align-items-center">
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      background: theme.grad,
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 10,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    <i className={`fas ${theme.icon} text-white`} style={{ fontSize: 16 }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h6
                      className={`mb-0 ${kind === "BANK" ? "text-primary" : "text-warning"} font-weight-bold text-truncate`}
                      style={{ fontSize: 13 }}
                    >
                      {fund.name}
                    </h6>
                    <div
                      className="d-flex align-items-center flex-wrap"
                      style={{ gap: 4, marginTop: 2 }}
                    >
                      {fund.code && (
                        <span
                          className="badge badge-secondary"
                          style={{ fontSize: 9, padding: "2px 5px" }}
                        >
                          {fund.code}
                        </span>
                      )}
                      <span
                        className="badge badge-primary"
                        style={{ fontSize: 9, padding: "2px 5px" }}
                      >
                        <i className="fas fa-wallet" aria-hidden="true" /> {typeText}
                      </span>
                    </div>
                    {workPlaceName && (
                      <small
                        className="text-muted d-block text-truncate"
                        style={{ fontSize: 9, marginTop: 2 }}
                      >
                        <i className="fas fa-map-marker-alt mr-1" aria-hidden="true" />
                        {workPlaceName}
                      </small>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-md-5 col-12">
                <div className="row g-1">
                  <div className="col-3 text-center">
                    <div style={MINI}>
                      <i
                        className="fas fa-wallet text-primary"
                        style={MINI_ICON}
                        aria-hidden="true"
                      />
                      <div style={MINI_LABEL}>{s("opening")}</div>
                      <div className="text-primary" style={MINI_VALUE}>
                        {formatN2(opening)}
                      </div>
                    </div>
                  </div>
                  <div className="col-3 text-center">
                    <div style={MINI}>
                      <i
                        className="fas fa-arrow-down text-success"
                        style={MINI_ICON}
                        aria-hidden="true"
                      />
                      <div style={MINI_LABEL}>{s("income")}</div>
                      <div className="text-success" style={MINI_VALUE}>
                        +{formatN2(Math.abs(income))}
                      </div>
                    </div>
                  </div>
                  <div className="col-3 text-center">
                    <div style={MINI}>
                      <i
                        className="fas fa-arrow-up text-danger"
                        style={MINI_ICON}
                        aria-hidden="true"
                      />
                      <div style={MINI_LABEL}>{s("expense")}</div>
                      <div className="text-danger" style={MINI_VALUE}>
                        -{formatN2(Math.abs(expense))}
                      </div>
                    </div>
                  </div>
                  <div className="col-3 text-center">
                    <div style={MINI}>
                      <i
                        className="fas fa-exchange-alt text-info"
                        style={MINI_ICON}
                        aria-hidden="true"
                      />
                      <div style={MINI_LABEL}>{s("net")}</div>
                      <div className={net >= 0 ? "text-success" : "text-danger"} style={MINI_VALUE}>
                        {net >= 0 ? "+" : ""}
                        {formatN2(net)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-md-2 col-6 text-center px-1">
                <div
                  style={{
                    background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                    border: "2px solid #f59e0b",
                    borderRadius: 8,
                    padding: "8px 6px",
                  }}
                >
                  <div style={{ ...BOX_LABEL, color: "#92400e" }}>{s("filtered")}</div>
                  <div className={closing >= 0 ? "text-success" : "text-danger"} style={BIG}>
                    {formatN2(closing)}
                    {symbol}
                  </div>
                  <small style={{ fontSize: 8, color: "#78716c" }}>
                    <i className="fas fa-filter" aria-hidden="true" /> {filteredCount}
                    <span className="sr-only"> {s("filteredCount", { count: filteredCount })}</span>
                  </small>
                </div>
              </div>

              <div className="col-md-2 col-6 text-center px-1">
                <div
                  style={{
                    background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
                    border: "2px solid #3b82f6",
                    borderRadius: 8,
                    padding: "8px 6px",
                  }}
                >
                  <div style={{ ...BOX_LABEL, color: "#1e3a8a" }}>{s("current")}</div>
                  <div
                    className={fund.currentBalance >= 0 ? "text-success" : "text-danger"}
                    style={BIG}
                  >
                    {formatN2(fund.currentBalance)}
                    {symbol}
                  </div>
                  <small style={{ fontSize: 8, color: "#475569" }}>
                    <i className="fas fa-history" aria-hidden="true" /> {fund.transactionCount}
                    <span className="sr-only">
                      {" "}
                      {s("transactionCount", { count: fund.transactionCount })}
                    </span>
                  </small>
                </div>
              </div>
            </div>

            {fund.futureCount > 0 && (
              <div
                className="mt-2"
                style={{
                  background: "#fef3c7",
                  border: "1px solid #fde68a",
                  borderRadius: 8,
                  padding: "6px 10px",
                }}
              >
                <small style={{ fontSize: 10, color: "#92400e", fontWeight: 600 }}>
                  <i className="fas fa-clock" aria-hidden="true" />{" "}
                  {s("future", {
                    count: fund.futureCount,
                    net: `${formatN2(fund.futureNet)}${symbol}`,
                  })}
                </small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
