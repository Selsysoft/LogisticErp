import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ZtoModal } from "../../../components";

export type TransferResult = {
  success: boolean;
  message: string;
  code?: string;
  target?: string;
};

type Props = {
  result: TransferResult | null;
  /** "Tamam" ya da kapatma; başarıda form sıfırlanır ve Transferler sekmesine geçilir. */
  onClose: (result: TransferResult) => void;
};

/** BS-11 "Transfer Sonucu" (ZTO BS:2777-2799, bsjs `showTransferResultModal`); ilk odak "Tamam". */
export function TransferResultModal({ result, onClose }: Props) {
  const { t } = useTranslation("ztoFinans");
  const okRef = useRef<HTMLButtonElement>(null);
  const show = result !== null;
  useEffect(() => {
    if (show) okRef.current?.focus();
  }, [show]);
  const close = () => {
    if (result) onClose(result);
  };
  const success = !!result?.success;
  const details = success && (result?.code !== undefined || result?.target !== undefined);
  return (
    <ZtoModal
      show={show}
      onHide={close}
      // Yalnız kökte (rootId); aynı id .modal-dialog'da da olunca DOM'da iki kez geçiyordu.
      rootId="transferResultModal"
      headerClassName={success ? "bg-success text-white" : "bg-danger text-white"}
      title={success ? t("transferCenter.result.success") : t("transferCenter.result.error")}
      footer={
        <button
          ref={okRef}
          type="button"
          className="btn btn-primary"
          id="transferResultOkBtn"
          onClick={close}
        >
          {t("transferCenter.result.ok")}
        </button>
      }
    >
      <div id="transferResultMessage" className="mb-3">
        {result?.message}
      </div>
      {details && (
        <div id="transferResultDetails">
          <div>
            <strong>{t("transferCenter.result.code")}</strong>{" "}
            <span id="transferResultCode">{result?.code || "-"}</span>
          </div>
          <div>
            <strong>{t("transferCenter.result.target")}</strong>{" "}
            <span id="transferResultTarget">{result?.target || "-"}</span>
          </div>
        </div>
      )}
    </ZtoModal>
  );
}
