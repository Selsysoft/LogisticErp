import { CSSProperties, ReactNode, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFundTransaction } from "../../../../pages/finance/fundApi";
import type { FundKind } from "../../../../pages/finance/types";
import { ZtoModal, currencySymbol, formatDate, formatN2, formatNumber } from "../../../components";
import { accountingKeyOf } from "./fundTransactionsLogic";

const THEME: Record<FundKind, string> = {
  BANK: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
  CASH: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
};
const HEADER_ICON: CSSProperties = {
  width: 48,
  height: 48,
  background: "rgba(255,255,255,0.2)",
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 16,
};
const FOOTER: CSSProperties = {
  background: "#f8fafc",
  borderRadius: "0 0 12px 12px",
  padding: "16px 24px",
};
const BADGE: CSSProperties = { fontSize: 11 };

export type FundTransactionDetailModalProps = {
  kind: FundKind;
  transactionId: string | null;
  onHide: () => void;
  multiCompany: boolean;
  companyName: (companyId: string) => string;
};

/**
 * BT-2 / CT-1 İşlem Detayı (ZTO BankTransactions/Index.cshtml:530-572 + viewTransactionDetail
 * :1389-1480; CashTransactions/Index.cshtml:447-487). Altbilgi yalnız "Kapat" (S-9). Sunucu metni
 * React metin düğümüyle basılır (ZTO `.html()`; MWG `sanitize-untrusted-html` gerekmez). Kaynak belge
 * bağlantısı `source.route`; Kur, TL Karşılığı ve (≥ 2 şirket) Şirket Blackrose ekleri.
 */
export function FundTransactionDetailModal({
  kind,
  transactionId,
  onHide,
  multiCompany,
  companyName,
}: FundTransactionDetailModalProps) {
  const { t } = useTranslation("ztoFinans");
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const detail = useFundTransaction(transactionId ?? undefined);
  const bank = kind === "BANK";
  const d = (key: string) => t(`fundTransactions.detail.${key}`);
  const data = detail.data;

  let body;
  if (detail.isPending) {
    body = (
      <div className="text-center py-4" role="status">
        <div
          className={`spinner-border ${bank ? "text-primary" : "text-warning"}`}
          aria-hidden="true"
        />
        <p className="text-muted mt-2">{d("loading")}</p>
      </div>
    );
  } else if (detail.isError || !data) {
    body = (
      <div className="alert alert-danger" role="alert">
        <i className="fas fa-exclamation-triangle mr-2" aria-hidden="true" />
        {d("failed")}
      </div>
    );
  } else {
    const income = data.direction === "IN";
    const symbol = currencySymbol(data.currency);
    const key = accountingKeyOf(kind, data.accountingType);
    const accounting = key ? t(`fundTransactions.accountingTypes.${key}`) : data.accountingType;
    const item = (
      label: string,
      value: ReactNode,
      valueClass = "detail-value",
      style?: CSSProperties,
    ) => (
      <div className="detail-item">
        <span className="detail-label">{label}</span>
        <span className={valueClass} style={style}>
          {value}
        </span>
      </div>
    );
    body = (
      <>
        <div
          className="card mb-3"
          style={{
            border: `2px solid ${income ? "#10b981" : "#ef4444"}`,
            borderRadius: 12,
            background: income ? "#f0fdf4" : "#fef2f2",
          }}
        >
          <div className="card-body text-center" style={{ padding: 24 }}>
            <span
              className={`badge ${income ? "badge-success" : "badge-danger"} mb-2`}
              style={{ fontSize: 11, padding: "6px 12px" }}
            >
              <i
                className={`fas ${income ? "fa-arrow-down" : "fa-arrow-up"} mr-1`}
                aria-hidden="true"
              />
              {d(income ? "in" : "out")}
            </span>
            <h2
              className={`${income ? "text-success" : "text-danger"} mb-1`}
              style={{ fontWeight: 700, fontSize: 36 }}
            >
              {income ? "+" : "-"}
              {formatN2(Math.abs(data.amount))} {symbol}
            </h2>
            <small className="text-muted">
              {data.currency} ({symbol})
            </small>
            {(data.reversal || data.reversed) && (
              <div className="mt-2">
                <span className="badge badge-light">{d("reversed")}</span>
              </div>
            )}
          </div>
        </div>
        <div className="row">
          <div className="col-md-6">
            <div className="detail-card">
              <div className="detail-card-header">
                <i className="fas fa-info-circle mr-2" aria-hidden="true" />
                {d("general")}
              </div>
              <div className="detail-card-body">
                {item(d("no"), `#${data.id}`)}
                {item(d("date"), formatDate(data.transactionDate))}
                {item(
                  d("accounting"),
                  <span className="badge badge-secondary" style={BADGE}>
                    {accounting || "-"}
                  </span>,
                )}
                {item(d("kind"), t(`fundTransactions.table.${income ? "in" : "out"}`))}
                {data.transferCode && item(d("reference"), `#${data.transferCode}`)}
              </div>
            </div>
            <div className="detail-card mt-3">
              <div className="detail-card-header">
                <i className="fas fa-file-alt mr-2" aria-hidden="true" />
                {d("document")}
              </div>
              <div className="detail-card-body">
                {data.source?.route &&
                  item(
                    d("documentLink"),
                    <a
                      href={data.source.route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline-primary"
                    >
                      <i className="fas fa-external-link-alt mr-1" aria-hidden="true" />
                      {d("view")}
                      {data.source.code ? ` (${data.source.code})` : ""}
                      <span className="sr-only"> {t("funds.common.opensInNewTab")}</span>
                    </a>,
                  )}
                {item(d("rate"), formatNumber(data.exchangeRate, 4))}
                {item(d("tlAmount"), `${formatN2(data.tlAmount)} ₺`)}
                {multiCompany && item(d("company"), companyName(data.companyId))}
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="detail-card">
              <div className="detail-card-header">
                <i
                  className={`fas ${bank ? "fa-university" : "fa-cash-register"} mr-2`}
                  aria-hidden="true"
                />
                {d(bank ? "bankInfo" : "cashInfo")}
              </div>
              <div className="detail-card-body">
                {item(
                  d(bank ? "bankName" : "cashName"),
                  data.fund.name,
                  "detail-value font-weight-bold text-primary",
                )}
                {data.fund.code && item(d(bank ? "bankCode" : "cashCode"), data.fund.code)}
                {bank &&
                  data.fund.iban &&
                  item(d("iban"), data.fund.iban, "detail-value", {
                    fontFamily: "monospace",
                    fontSize: 11,
                  })}
                {bank && data.fund.accountNo && item(d("accountNo"), data.fund.accountNo)}
                {bank && data.fund.bankBranchName && item(d("branch"), data.fund.bankBranchName)}
              </div>
            </div>
            <div className="detail-card mt-3">
              <div className="detail-card-header">
                <i className="fas fa-money-bill-wave mr-2" aria-hidden="true" />
                {d("currencyCard")}
              </div>
              <div className="detail-card-body">
                {item(d("currency"), data.currency, "detail-value font-weight-bold")}
                {item(d("symbol"), symbol)}
              </div>
            </div>
          </div>
        </div>
        {data.description && (
          <div className="detail-card mt-3">
            <div className="detail-card-header">
              <i className="fas fa-comment-alt mr-2" aria-hidden="true" />
              {d("description")}
            </div>
            <div className="detail-card-body">
              <p className="mb-0" style={{ color: "#475569", lineHeight: 1.6 }}>
                {data.description}
              </p>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <ZtoModal
      show={transactionId !== null}
      onHide={onHide}
      size="lg"
      rootId="transactionDetailModal"
      contentClassName="border-0"
      bare
      ariaLabelledBy={titleId}
      onEntered={() => closeRef.current?.focus()}
    >
      <div
        className="modal-header"
        style={{
          background: THEME[kind],
          color: "white",
          borderRadius: "12px 12px 0 0",
          padding: "20px 24px",
        }}
      >
        <div className="d-flex align-items-center">
          <div style={HEADER_ICON} aria-hidden="true">
            <i className="fas fa-receipt" style={{ fontSize: 24 }} />
          </div>
          <div>
            <h5 className="modal-title mb-0" id={titleId} style={{ fontWeight: 600, fontSize: 18 }}>
              {d(bank ? "titleBank" : "titleCash")}
            </h5>
            <small style={{ opacity: 0.9, fontSize: 13 }}>
              {d(bank ? "subtitleBank" : "subtitleCash")}
            </small>
          </div>
        </div>
        <button
          type="button"
          className="close text-white"
          style={{ opacity: 1 }}
          aria-label={d("close")}
          onClick={onHide}
        >
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>
      <div className="modal-body" style={{ padding: 24 }} id="modalDetailContent">
        {body}
      </div>
      <div className="modal-footer" style={FOOTER}>
        <button ref={closeRef} type="button" className="btn btn-secondary btn-sm" onClick={onHide}>
          <i className="fas fa-times mr-1" aria-hidden="true" />
          {d("close")}
        </button>
      </div>
    </ZtoModal>
  );
}
