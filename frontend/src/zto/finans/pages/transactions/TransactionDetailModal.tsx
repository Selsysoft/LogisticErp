import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useTransactionDetail, useTransactionSource } from "../../../../pages/finance/accountApi";
import { useCan } from "../../../../pages/finance/common";
import { useSettlement } from "../../../../pages/finance/settlementApi";
import { settlementLockErrorCode } from "../../../../pages/finance/settlementWarnings";
import { collectionsPath, paymentsPath } from "../../navItems";
import {
  ZtoModal,
  ZtoTooltip,
  formatDate,
  formatDateTime,
  formatN2,
  currencySymbol,
} from "../../../components";

export type TransactionDetailModalProps = {
  transactionId: string | null;
  onHide: () => void;
};

function InfoItem({
  icon,
  color,
  label,
  children,
  wide,
}: {
  icon: string;
  color: string;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-12 mb-4" : "col-md-6 mb-4"}>
      <div className="d-flex align-items-start">
        <div className={`icon-box ${color} text-white mr-3`}>
          <i className={icon} aria-hidden="true" />
        </div>
        <div>
          <small className="text-muted d-block mb-1">{label}</small>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * İşlem Detayları (ZTO Transactions.cshtml:2322-2354 normalDetailModal; içerik tjs populateManualDebtDetails
 * :4470-4555). Tarih, iş yeri, belge no/tür, vade, tutar, yöntem, açıklama, vergi kırılımı (belgeli satır),
 * oluşturan; "Kaynağa Git" kaynak rotası varsa. Ödeme/tahsilat "Düzenle" (12.2a §5.13; ZTO tjs
 * openPaymentEditInNewTab / openCollectionEditInNewTab): kayıt düzeltilebilirse Ödemeler / Tahsilatlar
 * yeni sekmede düzenleme modalıyla açılır; değilse pasif ve nedeni (`finance.error.<KOD>`, ör. cari
 * taşıma → TRANSACTION_TRANSFERRED) gösterilir. Yetkisiz kullanıcıda düğme yok.
 */
export function TransactionDetailModal({ transactionId, onHide }: TransactionDetailModalProps) {
  const { t } = useTranslation("ztoFinans");
  const navigate = useNavigate();
  const detail = useTransactionDetail(transactionId ?? undefined);
  const source = useTransactionSource(transactionId ?? undefined);
  const row = detail.data?.row;
  const doc = detail.data?.document ?? null;
  const symbol = currencySymbol(row?.currency ?? "TRY");
  const kindLabel = row ? t(`transactions.kind.${row.kind}`) : "";
  const sourceLabel =
    source.data?.label ??
    (row
      ? t(`translation:finance.source.${row.sourceType}`, { defaultValue: row.sourceType })
      : "");
  const route = source.data?.route ?? null;
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const settlementRow = row?.kind === "PAYMENT" || row?.kind === "COLLECTION";
  const settlementId =
    canPost && settlementRow && row?.sourceType === "SETTLEMENT" ? row.sourceId : null;
  const settlement = useSettlement(settlementId);
  const item = settlement.data?.item;
  const editHref =
    settlementId && item?.correctable
      ? item.type === "COLLECTION"
        ? collectionsPath({ openEditCollection: true, collectionId: settlementId })
        : paymentsPath({ openEditPayment: true, paymentId: settlementId })
      : null;
  const lockText = !settlementId
    ? t("transactions.detail.editSettlementHint")
    : settlement.isPending
      ? t("transactions.detail.editSettlementLoading")
      : item
        ? t(
            `translation:finance.error.${settlementLockErrorCode(item.lockReason, item.correctedById)}`,
          )
        : t(
            row?.kind === "COLLECTION"
              ? "translation:finance.error.SETTLEMENT_NOT_FOUND_COLLECTION"
              : "translation:finance.error.SETTLEMENT_NOT_FOUND",
          );

  return (
    <ZtoModal
      show={transactionId !== null}
      onHide={onHide}
      rootId="normalDetailModal"
      className="transaction-detail-modal"
      size="xl"
      scrollable
      headerClassName="bg-primary text-white"
      closeButtonClassName="text-white"
      bodyClassName="p-0"
      title={
        <>
          <i className="fas fa-info-circle mr-2" aria-hidden="true" />
          {t("transactions.detail.title")}
        </>
      }
      footer={
        <>
          {canPost && settlementRow ? (
            editHref ? (
              <button
                type="button"
                className="btn btn-warning"
                onClick={() => globalThis.open(editHref, "_blank", "noopener")}
              >
                <i className="fas fa-edit mr-1" aria-hidden="true" />
                {t("transactions.detail.editSettlement")}
                <span className="sr-only"> {t("translation:common.a11y.opensInNewTab")}</span>
              </button>
            ) : (
              <ZtoTooltip content={lockText}>
                <button
                  type="button"
                  className="btn btn-warning"
                  aria-disabled="true"
                  aria-busy={settlementId !== null && settlement.isPending}
                  onClick={(event) => event.preventDefault()}
                >
                  <i className="fas fa-edit mr-1" aria-hidden="true" />
                  {t("transactions.detail.editSettlement")}
                  <span className="sr-only"> ({lockText})</span>
                </button>
              </ZtoTooltip>
            )
          ) : null}
          {route && (
            <button
              type="button"
              className="btn btn-info"
              onClick={() => {
                onHide();
                navigate(route);
              }}
            >
              <i className="fas fa-external-link-alt mr-1" aria-hidden="true" />
              {t("transactions.detail.goSource")}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            {t("transactions.detail.close")}
          </button>
        </>
      }
    >
      {detail.isPending ? (
        <div id="normalDetailLoading" className="text-center py-5" role="status">
          <div className="spinner-border text-primary">
            <span className="sr-only">{t("transactions.loading")}</span>
          </div>
          <p className="mt-2">{t("transactions.detail.loading")}</p>
        </div>
      ) : detail.isError || !row ? (
        <div className="p-3">
          <div className="alert alert-warning mb-0">{t("transactions.detail.error")}</div>
        </div>
      ) : (
        <div id="normalDetailContent">
          <div id="normalColumnsSection">
            <div className="p-3">
              <div id="normalColumnsContent">
                <div
                  className="alert alert-info border-0 mb-3"
                  style={{ background: "linear-gradient(90deg, #e3f2fd 0%, #bbdefb 100%)" }}
                >
                  <i className="fas fa-info-circle mr-2" aria-hidden="true" />
                  <Trans
                    t={t}
                    i18nKey="transactions.detail.manualBanner"
                    values={{ kind: kindLabel, label: sourceLabel }}
                    components={{ b: <strong /> }}
                  />
                </div>
                {(row.reversal ||
                  row.reversed ||
                  detail.data?.transfer ||
                  doc?.status === "CANCELLED") && (
                  <div className="alert alert-warning mb-3">
                    <i className="fas fa-exclamation-triangle mr-2" aria-hidden="true" />
                    {doc?.status === "CANCELLED"
                      ? t("transactions.detail.cancelled")
                      : row.reversal
                        ? t("transactions.detail.reversal")
                        : row.reversed
                          ? t("transactions.detail.reversed")
                          : detail.data?.transfer?.role === "IN"
                            ? t("transactions.detail.transferIn")
                            : t("transactions.detail.transferOut")}
                  </div>
                )}
                <div className="card shadow-sm">
                  <div className="card-body p-4">
                    <div className="row">
                      <InfoItem
                        icon="fas fa-calendar-alt"
                        color="bg-primary"
                        label={t("transactions.detail.date")}
                      >
                        <strong>{formatDate(row.transactionDate)}</strong>
                      </InfoItem>
                      <InfoItem
                        icon="fas fa-building"
                        color="bg-secondary"
                        label={t("transactions.detail.workplace")}
                      >
                        <strong>{row.branchName || "-"}</strong>
                      </InfoItem>
                      {row.documentNo && (
                        <InfoItem
                          icon="fas fa-file-alt"
                          color="bg-info"
                          label={t("transactions.detail.documentNo")}
                        >
                          <strong>{row.documentNo}</strong>
                        </InfoItem>
                      )}
                      {(doc?.documentTypeName || row.documentType) && (
                        <InfoItem
                          icon="fas fa-tag"
                          color="bg-info"
                          label={t("transactions.detail.documentType")}
                        >
                          <strong>{doc?.documentTypeName ?? row.documentType}</strong>
                        </InfoItem>
                      )}
                      {row.dueDate && (
                        <InfoItem
                          icon="fas fa-calendar-check"
                          color="bg-warning"
                          label={t("transactions.detail.due")}
                        >
                          <strong>{formatDate(row.dueDate)}</strong>
                        </InfoItem>
                      )}
                      <InfoItem
                        icon="fas fa-lira-sign"
                        color="bg-danger"
                        label={t("transactions.detail.amount")}
                      >
                        <h5 className="mb-0 text-danger">
                          {formatN2(row.amount * row.sign)} {symbol}
                        </h5>
                      </InfoItem>
                      {row.paymentMethod && (
                        <InfoItem
                          icon="fas fa-money-check-alt"
                          color="bg-success"
                          label={t("transactions.detail.method")}
                        >
                          <strong>
                            {t(`translation:finance.paymentMethod.${row.paymentMethod}`, {
                              defaultValue: row.paymentMethod,
                            })}
                          </strong>
                        </InfoItem>
                      )}
                      {row.description && row.description !== "-" && (
                        <div className="col-12">
                          <div className="border-top pt-3 mt-2">
                            <small className="text-muted d-block mb-2">
                              <i className="fas fa-comment-alt mr-1" aria-hidden="true" />{" "}
                              {t("transactions.detail.description")}
                            </small>
                            <p className="mb-0" style={{ lineHeight: 1.6 }}>
                              {row.description}
                            </p>
                          </div>
                        </div>
                      )}
                      {doc?.tax && (
                        <div className="col-12">
                          <div className="border-top pt-3 mt-2">
                            <small className="text-muted d-block mb-2">
                              <i className="fas fa-file-invoice-dollar mr-1" aria-hidden="true" />{" "}
                              {t("transactions.detail.tax")} —{" "}
                              {doc.reflectToLedger
                                ? t("transactions.detail.reflected")
                                : t("transactions.detail.notReflected")}
                            </small>
                            <table className="table table-sm table-bordered mb-0">
                              <tbody>
                                {(
                                  [
                                    ["discountRate", `%${formatN2(doc.tax.discountRate)}`],
                                    ["discountAmount", formatN2(doc.tax.discountAmount)],
                                    ["netExclVat", formatN2(doc.tax.netExclVat)],
                                    ["vatRate", `%${formatN2(doc.tax.vatRate)}`],
                                    ["vatAmount", formatN2(doc.tax.vatAmount)],
                                    ["totalInclVat", formatN2(doc.tax.totalInclVat)],
                                    ["withholding", formatN2(doc.tax.withholdingAmount)],
                                    ["otherTaxes", formatN2(doc.tax.otherTaxesAmount)],
                                    ["netPayable", formatN2(doc.tax.netPayable)],
                                  ] as const
                                ).map(([key, value]) => (
                                  <tr key={key}>
                                    <th scope="row" className="font-weight-normal text-muted">
                                      {t(`transactions.document.${key}`)}
                                    </th>
                                    <td className="text-right">{value}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                    <div
                      className="border-top pt-2 mt-2 text-right text-muted"
                      style={{ fontSize: "0.8rem" }}
                    >
                      <span className="mr-3">
                        <i className="far fa-clock mr-1" aria-hidden="true" />
                        {formatDateTime(row.createdAt)}
                      </span>
                      <span>
                        <i className="far fa-user mr-1" aria-hidden="true" />
                        {row.createdBy}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ZtoModal>
  );
}
