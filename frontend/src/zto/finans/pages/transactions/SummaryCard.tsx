import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AccountBalanceBreakdown,
  BalanceBreakdownRow,
  TransactionKind,
} from "../../../../pages/finance/types";
import { ZtoPopover, formatN2, formatNumber } from "../../../components";
import {
  invoiceGap,
  kindTotals,
  settlement,
  summaryOrder,
  type KindTotals,
} from "./transactionsLogic";

const MINI: Record<TransactionKind, { card: string; icon: string }> = {
  RECEIVABLE: { card: "card-alacak", icon: "fas fa-file-invoice-dollar" },
  COLLECTION: { card: "card-tahsilat", icon: "fas fa-hand-holding-usd" },
  DEBT: { card: "card-borc", icon: "fas fa-file-invoice" },
  PAYMENT: { card: "card-odeme", icon: "fas fa-credit-card" },
};

const n0 = (v: number) => formatNumber(v, 0);

export type SummaryCardProps = {
  customer: boolean;
  totals: KindTotals;
  symbol: string;
  /** Resmi fatura toplamı (seçili para birimi; yalnız müşteri olmayanda). */
  invoiceTotal: number;
};

/**
 * Tek satır kombine kart (ZTO Transactions.cshtml:325-730): 4 mini istatistik (`N0`), Mahsuplaşma ve net
 * durum; müşteri olmayanda Borç kartında resmi fatura popover'ı.
 */
export function SummaryCard({ customer, totals, symbol, invoiceTotal }: SummaryCardProps) {
  const { t } = useTranslation("ztoFinans");
  const { receivableNet, payableNet, status } = settlement(customer, totals);
  const gap = invoiceGap(totals.DEBT, invoiceTotal);

  const invoicePopover = (
    <div className="invoice-tooltip-content">
      <div className="tooltip-info-row">
        <span className="label-text">{t("transactions.summary.totalDebt")}:</span>
        <span className="value-text">
          {formatN2(totals.DEBT)} {symbol}
        </span>
      </div>
      <div className="tooltip-info-row">
        <span className="label-text">{t("transactions.summary.officialInvoice")}:</span>
        <span className="value-text">
          {formatN2(invoiceTotal)} {symbol}
        </span>
      </div>
      <div className="tooltip-divider" />
      <div className={`tooltip-status status-${gap.status}`}>
        <i
          className={
            gap.status === "warning"
              ? "fas fa-exclamation-circle"
              : gap.status === "info"
                ? "fas fa-info-circle"
                : "fas fa-check-circle"
          }
          aria-hidden="true"
        />
        <div className="status-info">
          {gap.status === "success" ? (
            <>
              <strong>{t("transactions.summary.balanced")}</strong>
              <span>{t("transactions.summary.matches")}</span>
            </>
          ) : (
            <>
              <strong>
                {formatN2(Math.abs(gap.diff))} {symbol}
              </strong>
              <span>
                {t(
                  gap.status === "warning"
                    ? "transactions.summary.needInvoice"
                    : "transactions.summary.needDebt",
                )}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="row">
      <div className="col-12">
        <div className="erp-combined-card">
          <div className="erp-combined-content">
            <div className="erp-stats-section">
              {summaryOrder(customer).map((kind) => {
                const withButton = !customer && kind === "DEBT";
                return (
                  <div className="erp-mini-stat" key={kind}>
                    <div className={`erp-mini-icon ${MINI[kind].card}`}>
                      <i className={MINI[kind].icon} aria-hidden="true" />
                    </div>
                    <div
                      className={
                        withButton
                          ? "erp-mini-details erp-mini-details-with-button"
                          : "erp-mini-details"
                      }
                    >
                      <span className="erp-mini-label">{t(`transactions.kind.${kind}`)}</span>
                      <span className="erp-mini-value">
                        {n0(totals[kind])} {symbol}
                      </span>
                      {withButton && (
                        <>
                          <div style={{ width: 250 }} />
                          <ZtoPopover
                            content={invoicePopover}
                            trigger="click"
                            placement="bottom"
                            rootClose
                            className="invoice-popover"
                          >
                            <button
                              type="button"
                              className="invoice-info-btn"
                              aria-label={t("transactions.summary.invoiceInfo")}
                            >
                              <i className="fas fa-info-circle" aria-hidden="true" />
                              <span className={`status-dot ${gap.badge}`} />
                            </button>
                          </ZtoPopover>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="erp-divider" />
            <div className="erp-calculation-section">
              <div className="erp-calc-title">
                <i className="fas fa-calculator" aria-hidden="true" />
                <span>{t("transactions.summary.calc")}</span>
              </div>
              <div className="erp-calc-items">
                {customer ? (
                  <>
                    <div className="erp-calc-item">
                      <i className="fas fa-plus text-success" aria-hidden="true" />
                      <span>{t("transactions.summary.toCollect")}:</span>
                      <strong>
                        {n0(receivableNet)} {symbol}
                      </strong>
                    </div>
                    <div className="erp-calc-item">
                      <i className="fas fa-minus text-danger" aria-hidden="true" />
                      <span>{t("transactions.summary.toPay")}:</span>
                      <strong>
                        {n0(payableNet)} {symbol}
                      </strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="erp-calc-item">
                      <i className="fas fa-plus text-danger" aria-hidden="true" />
                      <span>{t("transactions.summary.toPayDebt")}:</span>
                      <strong>
                        {n0(payableNet)} {symbol}
                      </strong>
                    </div>
                    <div className="erp-calc-item">
                      <i className="fas fa-minus text-success" aria-hidden="true" />
                      <span>{t("transactions.summary.toCollect")}:</span>
                      <strong>
                        {n0(receivableNet)} {symbol}
                      </strong>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="erp-divider" />
            <div className="erp-result-section">
              <i className={`${status.icon} ${status.iconClass}`} aria-hidden="true" />
              <div className="erp-result-details">
                <div className="erp-result-amount">
                  {status.label === "balanced" ? "0.00" : n0(status.amount)} {symbol}
                </div>
                <span className={`badge ${status.badge}`}>
                  <i className={status.badgeIcon} aria-hidden="true" />{" "}
                  {t(`transactions.summary.${status.label}`)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Devir Kırılımı — Genel Toplam (TR:651-735): devir öncesi / sonrası / genel; kapalı açılır. */
export function RolloverBreakdown({
  breakdown,
  currency,
  symbol,
  splitDate,
}: {
  breakdown: AccountBalanceBreakdown;
  currency: string;
  symbol: string;
  splitDate: string | null;
}) {
  const { t } = useTranslation("ztoFinans");
  const [open, setOpen] = useState(false);
  const hasSplit = splitDate !== null;
  const all = kindTotals(breakdown.rows, currency, "ALL");
  const before = kindTotals(breakdown.rows, currency, "BEFORE");
  const after = kindTotals(breakdown.rows, currency, "AFTER");
  const rows: Array<{
    key: string;
    badge: string;
    label: string;
    pick: (k: KindTotals) => number;
  }> = [
    { key: "DEBT", badge: "badge-danger", label: t("transactions.kind.DEBT"), pick: (k) => k.DEBT },
    {
      key: "PAYMENT",
      badge: "badge-warning",
      label: t("transactions.kind.PAYMENT"),
      pick: (k) => k.PAYMENT,
    },
    {
      key: "RECEIVABLE",
      badge: "badge-success",
      label: t("transactions.kind.RECEIVABLE"),
      pick: (k) => k.RECEIVABLE,
    },
    {
      key: "COLLECTION",
      badge: "badge-primary",
      label: t("transactions.kind.COLLECTION"),
      pick: (k) => k.COLLECTION,
    },
  ];
  return (
    <div className="row" style={{ marginTop: 2 }}>
      <div className="col-12">
        <div className="card border-0 shadow-sm mb-0">
          <button
            type="button"
            id="devirBreakdownToggle"
            className={`card-header bg-white border-bottom py-1 px-2 d-flex align-items-center justify-content-between w-100 text-left${open ? " open" : ""}`}
            style={{ cursor: "pointer", userSelect: "none", border: 0 }}
            aria-expanded={open}
            aria-controls="devirBreakdownBody"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="font-weight-bold" style={{ fontSize: 11, color: "#0f766e" }}>
              <i className="fas fa-calendar-check mr-1" aria-hidden="true" />
              {t("transactions.breakdown.title")} — {t("transactions.breakdown.general")} (
              {t("transactions.breakdown.allSeasons")})
            </span>
            <span className="d-flex align-items-center" style={{ gap: 8 }}>
              {hasSplit && (
                <span className="text-muted" style={{ fontSize: 10 }}>
                  <i className="fas fa-cut mr-1" aria-hidden="true" />
                  {t("transactions.breakdown.split")}: {splitDate!.split("-").reverse().join(".")}
                </span>
              )}
              <i
                className="fas fa-chevron-down text-muted db-chevron"
                style={{ fontSize: 10, transition: "transform .2s" }}
                aria-hidden="true"
              />
            </span>
          </button>
          <div id="devirBreakdownBody" style={{ display: open ? undefined : "none" }}>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                  <thead className="thead-light">
                    <tr>
                      <th scope="col" style={{ width: "22%" }}>
                        <span className="sr-only">{t("transactions.table.type")}</span>
                      </th>
                      {hasSplit && (
                        <>
                          <th scope="col" className="text-right">
                            {t("transactions.breakdown.before")}
                          </th>
                          <th scope="col" className="text-right">
                            {t("transactions.breakdown.after")}
                          </th>
                        </>
                      )}
                      <th scope="col" className="text-right">
                        {t("transactions.breakdown.general")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td>
                          <span className={`badge ${r.badge}`}>{r.label}</span>
                        </td>
                        {hasSplit && (
                          <>
                            <td className="text-right text-muted">{formatN2(r.pick(before))}</td>
                            <td className="text-right text-muted">{formatN2(r.pick(after))}</td>
                          </>
                        )}
                        <td className="text-right font-weight-bold">
                          {formatN2(r.pick(all))} {symbol}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: "#f0fdfa" }}>
                      <td className="font-weight-bold" style={{ color: "#0f766e" }}>
                        <i className="fas fa-calculator mr-1" aria-hidden="true" />
                        {t("transactions.summary.calc")}
                      </td>
                      {hasSplit && (
                        <>
                          <td className="text-right font-weight-bold" style={{ color: "#0f766e" }}>
                            {formatN2(before.balance)}
                          </td>
                          <td className="text-right font-weight-bold" style={{ color: "#0f766e" }}>
                            {formatN2(after.balance)}
                          </td>
                        </>
                      )}
                      <td className="text-right font-weight-bold" style={{ color: "#0f766e" }}>
                        {formatN2(all.balance)} {symbol}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type DistributionGroup = {
  key: string;
  label: string;
  rows: BalanceBreakdownRow[];
  children?: DistributionGroup[];
};

/**
 * İş Yeri Borç/Alacak Dağılımı (TR:732-790; kart şablonu tjs createWorkPlaceBalanceCard :10802-10900):
 * aynı anda tek açık akordeon. ≥2 aktif şirkette şirket üst başlıkları (Blackrose eki, Y1).
 */
export function WorkplaceDistribution({
  groups,
  customer,
  currency,
  symbol,
  loading,
}: {
  groups: DistributionGroup[];
  customer: boolean;
  currency: string;
  symbol: string;
  loading: boolean;
}) {
  const { t } = useTranslation("ztoFinans");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const order: TransactionKind[] = customer
    ? ["RECEIVABLE", "COLLECTION", "DEBT", "PAYMENT"]
    : ["DEBT", "PAYMENT", "RECEIVABLE", "COLLECTION"];
  const statBox: Record<TransactionKind, string> = {
    RECEIVABLE: "fas fa-hand-holding-usd text-primary",
    COLLECTION: "fas fa-money-bill-wave text-success",
    DEBT: "fas fa-file-invoice-dollar text-danger",
    PAYMENT: "fas fa-credit-card text-warning",
  };

  const item = (group: DistributionGroup) => {
    const totals = kindTotals(group.rows, currency);
    const { status } = settlement(customer, totals);
    const open = openKey === group.key;
    const bodyId = `wp-${group.key}`;
    return (
      <div className={`workplace-accordion-item${open ? " open" : ""}`} key={group.key}>
        <button
          type="button"
          className="workplace-header w-100 text-left"
          style={{ cursor: "pointer", userSelect: "none", border: 0, background: "transparent" }}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpenKey(open ? null : group.key)}
        >
          <div className="workplace-info">
            <i
              className={group.label ? "fas fa-building" : "fas fa-question-circle text-danger"}
              aria-hidden="true"
            />
            <span className={group.label ? "workplace-name" : "workplace-name text-danger"}>
              {group.label || t("transactions.workplace.unknown")}
            </span>
          </div>
          <div className="workplace-summary">
            <span className="workplace-amount">
              {formatN2(status.amount)} {symbol}
            </span>
            <span className={`badge ${status.badge}`}>
              {t(`transactions.summary.${status.label}`)}
            </span>
            <i className="fas fa-chevron-down toggle-icon" aria-hidden="true" />
          </div>
        </button>
        <div id={bodyId} className="workplace-body" style={{ display: open ? undefined : "none" }}>
          <div className="workplace-stats">
            {order.map((kind) => (
              <div className="stat-box" key={kind}>
                <i className={statBox[kind]} aria-hidden="true" />
                <div>
                  <small>{t(`transactions.workplace.totals.${kind}`)}</small>
                  <strong>
                    {formatN2(totals[kind])} {symbol}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="row" id="workPlaceBalancesSection" style={{ marginTop: 2 }}>
      <div className="col-12">
        <div className="card border-0 shadow-sm mb-0">
          <div className="card-header bg-white border-bottom py-1 px-2">
            <div className="d-flex align-items-center">
              <i
                className="fas fa-building text-primary mr-1"
                style={{ fontSize: 11 }}
                aria-hidden="true"
              />
              <span className="mb-0 font-weight-bold text-primary" style={{ fontSize: 11 }}>
                {t("transactions.workplace.title")}
              </span>
            </div>
          </div>
          <div className="card-body p-1">
            {loading ? (
              <div id="workPlaceBalancesLoading" className="text-center py-1" role="status">
                <div className="spinner-border spinner-border-sm text-primary">
                  <span className="sr-only">{t("transactions.workplace.loading")}</span>
                </div>
                <p className="mt-1 mb-0" style={{ fontSize: 10, color: "#6c757d" }}>
                  {t("transactions.workplace.loading")}
                </p>
              </div>
            ) : groups.length === 0 ? (
              <div id="workPlaceBalancesEmpty">
                <div className="alert alert-info mb-0 py-1 px-2" style={{ fontSize: 10 }}>
                  <i className="fas fa-info-circle mr-1" aria-hidden="true" />
                  {t("transactions.workplace.empty")}
                </div>
              </div>
            ) : (
              <div id="workPlaceBalancesContent">
                <div id="workPlaceBalancesCards" className="accordion">
                  {groups.map((g) =>
                    g.children ? (
                      <div key={g.key} className="mb-1">
                        <div className="small font-weight-bold text-muted px-1">
                          <i className="fas fa-landmark mr-1" aria-hidden="true" />
                          {t("transactions.workplace.company")}: {g.label}
                        </div>
                        {g.children.map(item)}
                      </div>
                    ) : (
                      item(g)
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
