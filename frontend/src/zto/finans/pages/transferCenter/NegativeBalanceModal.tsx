import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ZtoModal, formatN2 } from "../../../components";
import type { NegativeBalance } from "./transferCenterLogic";

type Props = {
  /** null: kapalı. */
  info: (NegativeBalance & { cash: boolean; accountName: string; symbol: string }) | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * BS-12 "Bakiye Bilgilendirmesi" (ZTO BS:2800-2840, bsjs `showNegativeBalanceConfirmModal`). ZtoModal ile
 * doğrudan çizilir (ZtoConfirmModal'ın başlık/ileti kalıbı ZTO DOM'unu taşımaz); ilk odak "Vazgeç".
 */
export function NegativeBalanceModal({ info, onCancel, onConfirm }: Props) {
  const { t } = useTranslation("ztoFinans");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const show = info !== null;
  useEffect(() => {
    if (show) cancelRef.current?.focus();
  }, [show]);
  const suffix = info?.symbol ? ` ${info.symbol}` : "";
  return (
    <ZtoModal
      show={show}
      onHide={onCancel}
      centered
      // Yalnız kökte (rootId); aynı id .modal-dialog'da da olunca DOM'da iki kez geçiyordu.
      rootId="negativeBalanceConfirmModal"
      headerClassName="bg-light border-0"
      title={
        <span className="text-dark">
          <i className="fas fa-info-circle text-dark mr-1" aria-hidden="true" />{" "}
          {t("transferCenter.negative.title")}
        </span>
      }
      bodyClassName="pt-2"
      footerClassName="border-0 pt-2"
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-outline-secondary"
            onClick={onCancel}
          >
            {t("transferCenter.negative.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            id="btnConfirmNegativeBalance"
            onClick={onConfirm}
          >
            {t("transferCenter.negative.proceed")}
          </button>
        </>
      }
    >
      <p className="text-muted mb-2" style={{ fontSize: 13 }}>
        {t("transferCenter.negative.text")}
      </p>
      <div className="negative-balance-soft-card">
        <div className="negative-balance-soft-row">
          <span id="negativeBalanceAccountLabel">
            {info?.cash
              ? t("transferCenter.negative.sourceCash")
              : t("transferCenter.negative.sourceBank")}
          </span>
          <span id="negativeBalanceAccountName" className="negative-balance-soft-value">
            {info?.accountName || "-"}
          </span>
        </div>
        <div className="negative-balance-soft-row">
          <span>{t("transferCenter.negative.before")}</span>
          <span id="negativeBalanceBefore" className="negative-balance-soft-value">
            {formatN2(info?.before ?? 0)}
            {suffix}
          </span>
        </div>
        <div className="negative-balance-soft-row">
          <span className="negative-balance-soft-label-danger">
            {t("transferCenter.negative.outgoing")}
          </span>
          <span id="negativeBalanceAmount" className="negative-balance-soft-value outgoing">
            {formatN2(info?.outgoing ?? 0)}
            {suffix}
          </span>
        </div>
        <div className="negative-balance-soft-row">
          <span>{t("transferCenter.negative.after")}</span>
          <span id="negativeBalanceAfter" className="negative-balance-soft-value negative">
            {formatN2(info?.after ?? 0)}
            {suffix}
          </span>
        </div>
      </div>
      <p className="mb-0 mt-3" style={{ fontSize: 13, color: "#334155" }}>
        {t("transferCenter.negative.confirm")}
      </p>
    </ZtoModal>
  );
}
