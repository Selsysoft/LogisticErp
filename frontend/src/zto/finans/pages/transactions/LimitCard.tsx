import { Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { today } from "../../../../pages/finance/common";
import { ZtoChartLazy, formatDate, formatNumber } from "../../../components";
import { limitSeries, limitStatus } from "./transactionsLogic";

export type LimitCardProps = {
  credit: number;
  risk: number;
  symbol: string;
  /** Seçili para biriminde (tarih, yürüyen bakiye) noktaları. */
  points: ReadonlyArray<{ date: string; balance: number }>;
  balance: number;
  canEdit: boolean;
  onEdit: () => void;
};

const PERIODS = [10, 30, 0] as const;

/**
 * Kredi & Risk Limiti kartı (ZTO Transactions.cshtml:790-834 #creditRiskLimitCard; etiketler 04 §7 #5
 * düzeltmesiyle "Kredi Limiti"/"Risk Limiti"): rozetler, 10 / 30 / Maks. gün, `canvas#limitMiniChart`
 * (190 px) ve #limitStatusAlert.
 */
export function LimitCard({
  credit,
  risk,
  symbol,
  points,
  balance,
  canEdit,
  onEdit,
}: LimitCardProps) {
  const { t } = useTranslation("ztoFinans");
  const [days, setDays] = useState<number>(30);
  const series = useMemo(() => limitSeries(points, days, today()), [points, days]);
  const status = limitStatus(balance, credit, risk);
  const n0 = (v: number) => formatNumber(v, 0);
  const chartData = useMemo(
    () => ({
      labels: series.dates.map((d) => formatDate(d).slice(0, 5)),
      datasets: [
        {
          label: t("transactions.table.balance"),
          data: series.values,
          borderColor: "#0d6efd",
          backgroundColor: "rgba(13,110,253,.08)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        },
        ...(credit > 0
          ? [
              {
                label: t("transactions.limit.credit"),
                data: series.values.map(() => credit),
                borderColor: "#1db954",
                borderDash: [6, 4],
                pointRadius: 0,
                borderWidth: 1.5,
                fill: false,
              },
            ]
          : []),
        ...(risk > 0
          ? [
              {
                label: t("transactions.limit.risk"),
                data: series.values.map(() => risk),
                borderColor: "#f39c12",
                borderDash: [6, 4],
                pointRadius: 0,
                borderWidth: 1.5,
                fill: false,
              },
            ]
          : []),
      ],
    }),
    [series, credit, risk, t],
  );

  return (
    <div className="card border" id="creditRiskLimitCard">
      <div className="card-body p-0">
        <div
          className="d-flex align-items-center justify-content-between px-2 pt-2 pb-1"
          style={{ flexWrap: "wrap", gap: 4 }}
        >
          <div className="d-flex align-items-center" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="lc-limit-badge" id="creditLimitBox">
              {credit > 0 ? (
                <>
                  <span className="lc-limit-dot" style={{ background: "#1db954" }} />
                  <span className="lc-limit-label">{t("transactions.limit.credit")}:</span>
                  <strong className="lc-limit-val" style={{ color: "#1db954" }}>
                    {n0(credit)} {symbol}
                  </strong>
                </>
              ) : (
                <>
                  <span className="lc-limit-dot" style={{ background: "#ced4da" }} />
                  <span className="lc-limit-label" style={{ color: "#adb5bd" }}>
                    {t("transactions.limit.creditNone")}
                  </span>
                </>
              )}
            </span>
            <span className="lc-limit-badge" id="riskLimitBox">
              {risk > 0 ? (
                <>
                  <span className="lc-limit-dot" style={{ background: "#f39c12" }} />
                  <span className="lc-limit-label">{t("transactions.limit.risk")}:</span>
                  <strong className="lc-limit-val" style={{ color: "#f39c12" }}>
                    {n0(risk)} {symbol}
                  </strong>
                </>
              ) : (
                <>
                  <span className="lc-limit-dot" style={{ background: "#ced4da" }} />
                  <span className="lc-limit-label" style={{ color: "#adb5bd" }}>
                    {t("transactions.limit.riskNone")}
                  </span>
                </>
              )}
            </span>
          </div>
          <div className="d-flex align-items-center" style={{ gap: 4 }}>
            <div
              id="limitChartPeriodBtns"
              className="d-flex"
              role="group"
              aria-label={t("transactions.limit.period")}
            >
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`lc-period-btn${days === p ? " lc-period-active" : ""}`}
                  aria-pressed={days === p}
                  onClick={() => setDays(p)}
                >
                  {p === 0 ? t("transactions.limit.max") : p}
                </button>
              ))}
            </div>
            {canEdit && (
              <button
                type="button"
                className="lc-edit-btn"
                onClick={onEdit}
                title={t("transactions.limit.edit")}
                aria-label={t("transactions.limit.edit")}
              >
                <i className="fas fa-edit" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div
          id="limitMiniChartWrap"
          style={{ position: "relative", height: 190, padding: "0 2px 4px 2px" }}
        >
          <Suspense fallback={null}>
            <ZtoChartLazy
              type="line"
              data={chartData}
              height={186}
              legend={false}
              valueFormat="integer"
              colorize={false}
              ariaLabel={t("translation:common.a11y.limitChart", {
                days: days === 0 ? series.dates.length : days,
                credit: `${n0(credit)} ${symbol}`,
                risk: `${n0(risk)} ${symbol}`,
              })}
            />
          </Suspense>
        </div>
        {status && (
          <div
            id="limitStatusAlert"
            role="status"
            className={status === "credit" ? "alert-danger" : "alert-warning"}
            style={{
              margin: "0 8px 8px 8px",
              padding: "7px 10px",
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1.5,
            }}
          >
            <i className="fas fa-exclamation-triangle mr-1" aria-hidden="true" />
            {t(
              status === "credit"
                ? "transactions.limit.creditExceeded"
                : "transactions.limit.riskExceeded",
            )}
          </div>
        )}
      </div>
    </div>
  );
}
