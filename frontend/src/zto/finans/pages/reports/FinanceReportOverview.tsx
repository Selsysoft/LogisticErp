import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { LedgerSummaryRow, ReportType } from "../../../../pages/finance/types";
import { currencySymbol, formatN2 } from "../../../format";
import { REPORT_TYPES, absDec, compareCurrency, netSide } from "./financeReportLogic";

export type FinanceReportOverviewProps = {
  rows: readonly LedgerSummaryRow[];
  /** PERSONNEL satırı çizilsin mi (sunucu `personnelHidden` false ve FINANCE_EMPLOYEE_VIEW). */
  showPersonnel: boolean;
  /** Tür bağlantısı (tüm süzgeçler korunur). */
  typeHref: (type: ReportType) => string;
  /** "Ad (Sembol)" (ZTO `CurrencyName`). */
  currencyName: (code: string) => string;
};

/**
 * Finans Raporları — Genel Bakış (ZTO Index.cshtml:135-186): tür × para birimi borcumuz / alacağımız /
 * net / açık cari; verisi olmayan tür için tek "-" satırı, son satır "Rapor dışı" (bağlantısız).
 * "Bekleyen (tahmini)" sütunu ve "Cariye bağlanmamış kayıtlar" uyarısı yok (bahçe akışı, MX1 §2.7).
 */
export function FinanceReportOverview(props: FinanceReportOverviewProps) {
  const { t } = useTranslation("ztoFinans");
  const types: Array<ReportType | null> = [
    ...REPORT_TYPES.filter((type) => type !== "PERSONNEL" || props.showPersonnel),
    null,
  ];
  const title = t("financeReport.overviewTitle");

  return (
    <section className="rp-card">
      <div className="rp-sec-head">
        <h2 id="frOverviewTitle">{title}</h2>
        <span className="rp-sec-meta">{t("financeReport.overview.hint")}</span>
      </div>
      <div className="rp-scroll" role="region" aria-labelledby="frOverviewTitle" tabIndex={0}>
        <table className="rp" data-fr-sheet={title}>
          <thead>
            <tr>
              <th>{t("financeReport.overview.reportType")}</th>
              <th className="fr-mid">{t("financeReport.overview.currency")}</th>
              <th className="num">{t("financeReport.overview.weOwe")}</th>
              <th className="num">{t("financeReport.overview.theyOwe")}</th>
              <th className="num fr-mid">{t("financeReport.overview.net")}</th>
              <th className="num fr-mid">{t("financeReport.overview.openAccounts")}</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => {
              const name = type ? t(`financeReport.types.${type}`) : t("financeReport.outside");
              const label = type ? <Link to={props.typeHref(type)}>{name}</Link> : name;
              const totals = props.rows
                .filter((row) => row.reportType === type)
                .slice()
                .sort((a, b) => compareCurrency(a.currency, b.currency));
              if (totals.length === 0) {
                return (
                  <tr key={type ?? "outside"}>
                    <td className="fr-sticky">{label}</td>
                    <td className="fr-mid">-</td>
                    <td className="num" data-v="0">
                      -
                    </td>
                    <td className="num" data-v="0">
                      -
                    </td>
                    <td className="num fr-mid" data-v="0">
                      -
                    </td>
                    <td className="num fr-mid" data-v="0">
                      0
                    </td>
                  </tr>
                );
              }
              return (
                <Fragment key={type ?? "outside"}>
                  {totals.map((total) => {
                    const symbol = currencySymbol(total.currency);
                    const side = netSide(total.net);
                    return (
                      <tr key={total.currency}>
                        <td className="fr-sticky">{label}</td>
                        <td className="fr-mid">{props.currencyName(total.currency)}</td>
                        <td className="num" data-v={total.weOwe}>
                          {formatN2(total.weOwe)} {symbol}
                        </td>
                        <td className="num" data-v={total.theyOwe}>
                          {formatN2(total.theyOwe)} {symbol}
                        </td>
                        <td className="num fr-mid" data-v={total.net}>
                          {formatN2(absDec(total.net))} {symbol}{" "}
                          <span className="fr-sub">
                            {side ? t(`financeReport.side.${side}`) : ""}
                          </span>
                        </td>
                        <td className="num fr-mid" data-v={String(total.openAccounts)}>
                          {total.openAccounts}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rp-note">{t("financeReport.overview.note")}</p>
    </section>
  );
}
