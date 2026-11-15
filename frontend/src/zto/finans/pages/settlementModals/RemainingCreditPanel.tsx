import { useState, type ReactNode } from "react";
import { useAccountBalances } from "../../../../pages/finance/accountApi";
import { invoiceGapText, isMissing } from "../../../../pages/finance/settlementWarnings";
import { currencySymbol, formatMoney, formatN2 } from "../../../components";
import type { RemainingCreditPanelProps } from "./index";
import { creditSummary, currenciesOf } from "./panelLogic";
import { useModalText } from "./parts";

/*
 * Cari alacak paneli (ZTO `#remainingCreditInfo`, collections.js 1755-2070; 12.2a_TASARIM §5.9):
 * para birimi düğmeleri + "CARİ ALACAK BİLGİLERİ" akordeonu (4 kart + mahsuplaşma). Kaynak
 * `GET /accounts/{id}/balances?groupBy=COMPANY`; alacak şirket başına `max(0, debit − credit)`.
 * Akordeon başlığı ZTO'daki gibi `div.cari-alacak-header`; klavye için `role="button"`,
 * `tabIndex`, `aria-expanded`, `aria-controls` (MWG accordion; ok tuşu gezinmesi yok).
 */

export function RemainingCreditPanel({ accountId, companyId }: RemainingCreditPanelProps) {
  const { tm, tr } = useModalText();
  const balances = useAccountBalances(accountId, { groupBy: "COMPANY", companyId });
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const currencies = currenciesOf(balances.data?.rows);
  const currency = picked && currencies.includes(picked) ? picked : (currencies[0] ?? null);

  if (balances.isPending) {
    return (
      <div
        className="alert alert-info text-center loading-message"
        style={{ marginBottom: 15 }}
        role="status"
      >
        <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {tm("creditPanel.loading")}
      </div>
    );
  }
  if (balances.isError) {
    return (
      <div className="alert alert-danger" style={{ marginBottom: 15 }} role="alert">
        <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
        {tm("creditPanel.loadFailed", {
          message: balances.error instanceof Error ? balances.error.message : "",
        })}
      </div>
    );
  }

  const shown = currency ?? "TRY";
  const summary = creditSummary(balances.data?.rows, shown, companyId);
  const symbol = currencySymbol(shown);
  const gaps = (balances.data?.invoiceGaps ?? [])
    .filter(isMissing)
    .filter((gap) => (companyId === null ? gap.companyId === null : gap.companyId === companyId));
  const toggle = () => setOpen((value) => !value);

  return (
    <>
      {currencies.length > 0 && (
        <div className="currency-filter-container mb-3">
          <label
            className="d-block mb-2"
            style={{ fontWeight: 600, fontSize: 13 }}
            id="creditCurrencyFilterLabel"
          >
            <i className="fas fa-filter" aria-hidden="true" /> {tm("creditPanel.currencyFilter")}
          </label>
          <div
            className="btn-group btn-group-sm"
            role="group"
            aria-labelledby="creditCurrencyFilterLabel"
          >
            {currencies.map((code) => (
              <button
                key={code}
                type="button"
                className={
                  code === currency
                    ? "btn btn-sm collection-currency-btn active"
                    : "btn btn-sm collection-currency-btn"
                }
                aria-pressed={code === currency}
                onClick={() => setPicked(code)}
              >
                {currencySymbol(code)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="cari-alacak-accordion">
        <div
          className={open ? "cari-alacak-header open" : "cari-alacak-header"}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-controls="creditInfoBody"
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggle();
            }
          }}
        >
          <span>
            <i className="fas fa-chart-line mr-2" aria-hidden="true" /> {tm("creditPanel.title")}
          </span>
          <i className="fas fa-chevron-right accordion-chevron" aria-hidden="true" />
        </div>
        <div className="cari-alacak-body" id="creditInfoBody" hidden={!open}>
          <div className="row">
            <StatCard
              className="card-alacak"
              icon="fa-file-invoice-dollar"
              label={tm("creditPanel.totalReceivable")}
              value={summary.totalReceivable}
              symbol={symbol}
              rate={100}
            />
            <StatCard
              className="card-tahsilat"
              icon="fa-hand-holding-usd"
              label={tm("creditPanel.totalCollection")}
              value={summary.totalCollection}
              symbol={symbol}
              rate={summary.collectionRate}
            />
            <StatCard
              className="card-borc"
              icon="fa-file-invoice"
              label={tm("creditPanel.totalDebt")}
              value={summary.totalDebt}
              symbol={symbol}
              rate={100}
            />
            <StatCard
              className="card-odeme"
              icon="fa-credit-card"
              label={tm("creditPanel.totalPayment")}
              value={summary.totalPayment}
              symbol={symbol}
              rate={summary.paymentRate}
            />
          </div>
          <div className="row mt-2">
            <div className="col-12">
              <div className="erp-stat-card card-borc border-0 shadow-sm">
                <div className="card-body p-3" style={{ backgroundColor: "white" }}>
                  <div className="row align-items-center">
                    <div className="col-md-6">
                      <div className="d-flex align-items-center mb-2">
                        <i className="fas fa-calculator mr-2" aria-hidden="true" />
                        <strong>{tm("creditPanel.offset")}</strong>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                        <div className="d-flex justify-content-between">
                          <span>
                            <i className="fas fa-plus text-success mr-1" aria-hidden="true" />{" "}
                            {tm("creditPanel.toCollect")}
                          </span>
                          <strong>
                            {formatN2(summary.toCollect)} {symbol}
                          </strong>
                        </div>
                        <div className="d-flex justify-content-between">
                          <span>
                            <i className="fas fa-minus text-danger mr-1" aria-hidden="true" />{" "}
                            {tm("creditPanel.toPay")}
                          </span>
                          <strong>
                            {formatN2(summary.toPay)} {symbol}
                          </strong>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-1 d-none d-md-block text-center">
                      <div
                        style={{
                          width: 1,
                          height: 60,
                          background: "rgba(0,0,0,0.1)",
                          margin: "0 auto",
                        }}
                      />
                    </div>
                    <div className="col-md-5 text-center" id="customerNetBalanceCard">
                      <NetBalance sign={summary.netSign} amount={summary.net} symbol={symbol} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {gaps.length > 0 && (
        <div className="mb-2" role="note">
          {gaps.map((gap) => (
            <small
              key={`${gap.side}-${gap.currency}-${gap.companyId ?? ""}`}
              className="d-block text-warning"
            >
              {invoiceGapText(gap, formatMoney, (key, values) => tr(key, values))}
            </small>
          ))}
        </div>
      )}
    </>
  );
}

function StatCard({
  className,
  icon,
  label,
  value,
  symbol,
  rate,
}: {
  className: string;
  icon: string;
  label: string;
  value: string;
  symbol: string;
  rate: number;
}) {
  return (
    <div className="col-xl-3 col-lg-3 col-md-6 col-6">
      <div className={`erp-stat-card ${className}`} style={{ marginBottom: 10 }}>
        <div className="erp-stat-content">
          <div className="erp-stat-icon">
            <i className={`fas ${icon}`} aria-hidden="true" />
          </div>
          <div className="erp-stat-details">
            <span className="erp-stat-label">{label}</span>
            <div className="erp-stat-value">
              {formatN2(value)} <span className="erp-stat-currency">{symbol}</span>
            </div>
            <div className="erp-stat-progress">
              <div className="erp-stat-progress-bar" style={{ width: `${Math.min(rate, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NetBalance({
  sign,
  amount,
  symbol,
}: {
  sign: -1 | 0 | 1;
  amount: string;
  symbol: string;
}) {
  const { tm } = useModalText();
  const color = sign > 0 ? "#28a745" : sign < 0 ? "#dc3545" : "#6c757d";
  let badge: ReactNode = null;
  if (sign > 0) {
    badge = (
      <span className="badge badge-success" style={{ fontSize: 11, padding: "6px 12px" }}>
        <i className="fas fa-arrow-up" aria-hidden="true" /> {tm("creditPanel.netDebtor")}
      </span>
    );
  } else if (sign < 0) {
    badge = (
      <span className="badge badge-danger" style={{ fontSize: 11, padding: "6px 12px" }}>
        <i className="fas fa-arrow-down" aria-hidden="true" /> {tm("creditPanel.netCreditor")}
      </span>
    );
  } else {
    badge = (
      <span className="badge badge-secondary" style={{ fontSize: 11, padding: "6px 12px" }}>
        <i className="fas fa-check" aria-hidden="true" /> {tm("creditPanel.netZero")}
      </span>
    );
  }
  return (
    <div>
      <div className="mb-2" style={{ fontSize: 12, color: "#6c757d", fontWeight: 600 }}>
        {tm("creditPanel.net")}
      </div>
      <div style={{ fontSize: 28, fontWeight: "bold", color }}>
        {formatN2(amount)} {symbol}
      </div>
      <div className="mt-2">{badge}</div>
    </div>
  );
}
