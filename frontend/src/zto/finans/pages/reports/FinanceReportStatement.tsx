import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Account, AccountMethodTotal, StatementLine } from "../../../../pages/finance/types";
import { cmpDec } from "../../../decimal";
import { currencySymbol, formatN2, maskTaxNumber } from "../../../format";
import { formatIsoDate } from "../../reports/reportDates";
import {
  STATEMENT_MAX_ROWS,
  absDec,
  balanceSuffix,
  sortMethods,
  type FrStatementBlock,
} from "./financeReportLogic";

export type FinanceReportStatementProps = {
  account: Account;
  blocks: readonly FrStatementBlock[];
  truncated: boolean;
  methods: readonly AccountMethodTotal[];
  /** "Listeye dön" (carinin rapor türü; yoksa düğme yok). */
  backHref: string | null;
  /** "Mevcut cari ekstresi" (yeni sekme). */
  legacyHref: string;
  /** Dönem başı ("DEVREDEN BAKİYE" tarihi; "Tümü"de boş). */
  openingDate: string | null;
  branchName: (branchId: string) => string;
  /** Belge türü adı (Tür sütunu alt metni); yoksa "". */
  typeName: (line: StatementLine) => string;
  currencyName: (code: string) => string;
};

/**
 * Finans Raporları — cari ekstre kipi (ZTO Index.cshtml:363-463): cari kartı (vergi no her
 * kullanıcıda maskeli — Rev 1 SEC-12.8-05, OK-12.8-27), para birimi başına devir + hareketler + yürüyen
 * bakiye + dönem toplamı, ödeme ve tahsilat yöntemleri. Borç sütunu DEBIT (alacaklarımız ve
 * ödemelerimiz), Alacak sütunu CREDIT; bakiye eki B (bize borçlu) / A (biz borçluyuz).
 */
export function FinanceReportStatement(props: FinanceReportStatementProps) {
  const { t } = useTranslation("ztoFinans");
  const { account } = props;
  const taxNumber = maskTaxNumber(account.taxNumber, account.taxNumberMasked);
  const balanceText = (value: string) =>
    `${formatN2(absDec(value))} ${balanceSuffix(value)}`.trim();
  const amountText = (value: string) => (cmpDec(value, 0) === 0 ? "" : formatN2(value));
  const methods = sortMethods(props.methods);

  return (
    <>
      <section className="rp-card fr-account">
        <div className="rp-sec-head">
          <h2>
            {account.code} {account.name}
            {!account.active && (
              <>
                {" "}
                <span className="rp-tag warn">{t("financeReport.list.passive")}</span>
              </>
            )}
          </h2>
          <div className="rp-sec-tools">
            {props.backHref && (
              <Link className="rp-btn" to={props.backHref}>
                <i className="fas fa-arrow-left" aria-hidden="true" />{" "}
                {t("financeReport.statement.backToList")}
              </Link>
            )}
            <a className="rp-btn" href={props.legacyHref} target="_blank" rel="noopener">
              {t("financeReport.statement.legacyStatement")}
            </a>
          </div>
        </div>
        <div className="rp-sec-meta">
          {account.subGroupName}
          {taxNumber && (
            <span>
              {" "}
              ·{" "}
              {t("financeReport.statement.taxNumber", {
                number: taxNumber,
                office: account.taxOffice ?? "",
              }).trim()}
            </span>
          )}
          {account.address && <span> · {account.address}</span>}
        </div>
      </section>
      {props.truncated && (
        <div className="rp-notice bad">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
          {t("financeReport.statement.truncated", { count: STATEMENT_MAX_ROWS })}
        </div>
      )}
      {props.blocks.length === 0 && (
        <div className="rp-card rp-empty">
          <h2>{t("financeReport.notices.empty")}</h2>
        </div>
      )}
      {props.blocks.map((block) => {
        const symbol = currencySymbol(block.currency);
        const headingId = `frBlock-${block.currency}`;
        return (
          <section key={block.currency} className="rp-card fr-block">
            <div className="rp-sec-head">
              <h2 id={headingId}>{props.currencyName(block.currency)}</h2>
              <span className="rp-sec-meta">
                {t("financeReport.statement.closing", {
                  amount: formatN2(absDec(block.closing)),
                  symbol,
                  side: balanceSuffix(block.closing),
                }).trim()}
              </span>
            </div>
            <div className="rp-scroll" role="region" aria-labelledby={headingId} tabIndex={0}>
              <table className="rp" data-fr-sheet={t("financeReport.statement.sheet", { symbol })}>
                <thead>
                  <tr>
                    <th>{t("financeReport.statement.columns.date")}</th>
                    <th>{t("financeReport.statement.columns.documentNo")}</th>
                    <th className="fr-opt">{t("financeReport.statement.columns.kind")}</th>
                    <th className="fr-mid">{t("financeReport.statement.columns.description")}</th>
                    <th className="fr-mid">{t("financeReport.statement.columns.method")}</th>
                    <th className="fr-opt">{t("financeReport.statement.columns.workplace")}</th>
                    <th className="num">{t("financeReport.statement.columns.debit")}</th>
                    <th className="num">{t("financeReport.statement.columns.credit")}</th>
                    <th className="num">{t("financeReport.statement.columns.balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="fr-open">
                    <td>{props.openingDate ? formatIsoDate(props.openingDate) : ""}</td>
                    <td />
                    <td className="fr-opt" />
                    <td className="fr-mid">{t("financeReport.statement.opening")}</td>
                    <td className="fr-mid" />
                    <td className="fr-opt" />
                    <td className="num" data-v="0" />
                    <td className="num" data-v="0" />
                    <td className="num" data-v={block.opening}>
                      {balanceText(block.opening)}
                    </td>
                  </tr>
                  {block.rows.map(({ line, debit, credit, balance }) => {
                    const typeName = props.typeName(line);
                    return (
                      <tr key={line.id}>
                        <td data-v={line.date}>{formatIsoDate(line.date)}</td>
                        <td>{line.documentNo ?? ""}</td>
                        <td className="fr-opt">
                          {t(`financeReport.statement.kinds.${line.kind}`, { defaultValue: "" })}
                          {typeName && <span className="fr-sub"> · {typeName}</span>}
                        </td>
                        <td className="fr-mid">{line.description ?? ""}</td>
                        <td className="fr-mid">
                          {line.paymentMethod
                            ? t(`financeReport.statement.methodNames.${line.paymentMethod}`, {
                                defaultValue: line.paymentMethod,
                              })
                            : ""}
                        </td>
                        <td className="fr-opt">{props.branchName(line.branchId)}</td>
                        <td className="num" data-v={debit}>
                          {amountText(debit)}
                        </td>
                        <td className="num" data-v={credit}>
                          {amountText(credit)}
                        </td>
                        <td className="num" data-v={balance}>
                          {balanceText(balance)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="fr-close">
                    <td />
                    <td />
                    <td className="fr-opt" />
                    <td className="fr-mid">{t("financeReport.statement.periodTotal")}</td>
                    <td className="fr-mid" />
                    <td className="fr-opt" />
                    <td className="num" data-v={block.periodDebit}>
                      {formatN2(block.periodDebit)}
                    </td>
                    <td className="num" data-v={block.periodCredit}>
                      {formatN2(block.periodCredit)}
                    </td>
                    <td className="num" data-v={block.closing}>
                      {balanceText(block.closing)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {methods.length > 0 && (
        <section className="rp-card">
          <div className="rp-sec-head">
            <h2 id="frMethodsTitle">{t("financeReport.statement.methodsTitle")}</h2>
          </div>
          <div className="rp-scroll" role="region" aria-labelledby="frMethodsTitle" tabIndex={0}>
            <table className="rp" data-fr-sheet={t("financeReport.statement.methodsSheet")}>
              <thead>
                <tr>
                  <th>{t("financeReport.statement.methodColumns.type")}</th>
                  <th>{t("financeReport.statement.methodColumns.method")}</th>
                  <th>{t("financeReport.statement.methodColumns.currency")}</th>
                  <th className="num">{t("financeReport.statement.methodColumns.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((method) => (
                  <tr key={`${method.type}|${method.method}|${method.currency}`}>
                    <td>{t(`financeReport.statement.methodKinds.${method.type}`)}</td>
                    <td>
                      {t(`financeReport.statement.methodNames.${method.method}`, {
                        defaultValue: method.method,
                      })}
                    </td>
                    <td>{props.currencyName(method.currency)}</td>
                    <td className="num" data-v={method.amount}>
                      {formatN2(method.amount)} {currencySymbol(method.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="rp-note">{t("financeReport.statement.note")}</p>
    </>
  );
}
