import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useReverseIntercompany,
  useReverseTransfer,
  useTransferDependents,
} from "../../../../pages/finance/fundApi";
import type { TransferListRow } from "../../../../pages/finance/types";
import { ZtoModal, formatDate, formatN2, useZtoSnackbar } from "../../../components";
import { errorKey, errorParts, reverseDate, rowTypeKey, todayIso } from "./transferCenterLogic";

type Props = {
  row: TransferListRow | null;
  onHide: () => void;
};

/**
 * BS-10 "Transfer Sil" (ZTO BS:2722-2775, bsjs :3899-3964): silme = ters kayıt (`reverse`), tarih
 * max(bugün, transfer tarihi). Döviz bozumunu kaynak kullanan bozum varsa engel bloğu ve Sil pasif.
 * Şirketler arası satır `/intercompany-transfers/{id}/reverse`. İlk odak "İptal".
 */
export function DeleteTransferModal({ row, onHide }: Props) {
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const show = row !== null;
  const isFx = row?.recordType === "FUND_TRANSFER" && row.transferType === "FX_EXCHANGE";
  const dependents = useTransferDependents(row?.id, { enabled: isFx });
  const blocked = isFx && (dependents.data?.length ?? 0) > 0;
  const reverse = useReverseTransfer();
  const reverseIntercompany = useReverseIntercompany();
  const busy = reverse.isPending || reverseIntercompany.isPending;

  useEffect(() => {
    if (!show) return;
    setReason("");
    setError(null);
    cancelRef.current?.focus();
  }, [show, row?.id]);

  async function confirm() {
    if (!row?.id) {
      setError(t("transferCenter.delete.noId"));
      return;
    }
    const body = {
      date: reverseDate(row.transferDate, todayIso()),
      reason: reason.trim() || undefined,
    };
    try {
      if (row.recordType === "INTERCOMPANY") {
        await reverseIntercompany.mutateAsync({ id: row.id, body });
      } else {
        await reverse.mutateAsync({ id: row.id, body });
      }
      snackbar.show(t("transferCenter.delete.done"), "success");
      onHide();
    } catch (err) {
      const { code, message } = errorParts(err);
      const key = errorKey(code);
      setError(key ? t(`transferCenter.${key}`) : (message ?? t("transferCenter.delete.error")));
    }
  }

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      size="lg"
      // Yalnız kökte (rootId); aynı id .modal-dialog'da da olunca DOM'da iki kez geçiyordu.
      rootId="deleteTransferModal"
      headerClassName="bg-danger text-white"
      closeButtonClassName="text-white"
      title={
        <>
          <i className="fas fa-trash-alt mr-1" aria-hidden="true" />
          {t("transferCenter.delete.title")}
        </>
      }
      footer={
        <>
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onHide}>
            {t("transferCenter.delete.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            id="btnConfirmDelete"
            disabled={blocked || busy}
            onClick={confirm}
          >
            <i className="fas fa-trash-alt" aria-hidden="true" />{" "}
            {t("transferCenter.delete.submit")}
          </button>
        </>
      }
    >
      <div className="mb-2 small text-muted" id="deleteTransferInfo">
        {row ? `${row.code || "-"} | ${t(`transferCenter.${rowTypeKey(row)}`)}` : "-"}
      </div>
      {error && (
        <div className="alert alert-danger py-2 mb-2" role="alert">
          {error}
        </div>
      )}
      {blocked ? (
        <div id="deleteBlockedSection">
          <div className="alert alert-danger py-2 mb-2">
            <i className="fas fa-exclamation-triangle mr-1" aria-hidden="true" />
            <strong>{t("transferCenter.delete.blocked")}</strong>
            <span id="deleteBlockedMsg">
              {` ${dependents.data?.length ?? 0} ${t("transferCenter.delete.blockedTail")}`}
            </span>
          </div>
          <div className="small font-weight-bold mb-1">{t("transferCenter.delete.usedBy")}</div>
          <table className="table table-sm table-bordered mb-0" style={{ fontSize: 11 }}>
            <thead className="thead-light">
              <tr>
                <th>{t("transferCenter.delete.code")}</th>
                <th>{t("transferCenter.delete.date")}</th>
                <th>{t("transferCenter.delete.sourceBank")}</th>
                <th>{t("transferCenter.delete.targetBank")}</th>
                <th className="text-right">{t("transferCenter.delete.used")}</th>
              </tr>
            </thead>
            <tbody id="deleteBlockedList">
              {dependents.data?.map((d) => (
                <tr key={d.transferId}>
                  <td>
                    <strong>{d.code || "-"}</strong>
                  </td>
                  <td>{formatDate(d.date) || "-"}</td>
                  <td>{d.sourceFundName || "-"}</td>
                  <td>{d.targetFundName || "-"}</td>
                  <td className="text-right">{d.usedAmount ? formatN2(d.usedAmount) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="alert alert-warning py-1 mt-2 mb-0" style={{ fontSize: 11 }}>
            <i className="fas fa-info-circle mr-1" aria-hidden="true" />
            {t("transferCenter.delete.mustDelete")}
          </div>
        </div>
      ) : (
        <div id="deleteNormalSection">
          <div className="form-group mb-0">
            <label htmlFor="deleteTransferReason">{t("transferCenter.delete.reason")}</label>
            <textarea
              id="deleteTransferReason"
              className="form-control"
              rows={2}
              maxLength={500}
              placeholder={t("transferCenter.delete.reasonPlaceholder")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <small className="form-text text-muted">{t("transferCenter.delete.help")}</small>
          </div>
        </div>
      )}
    </ZtoModal>
  );
}
