import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useDeleteSubcontractCost,
  useReverseSubcontractCost,
} from "../../../../pages/operations/subcontractApi";
import type { SubcontractCostRow } from "../../../../pages/operations/types";
import { ZtoModal, useZtoSnackbar } from "../../../components";
import { localToday } from "../expenses/expenseDates";
import {
  REASON_MAX,
  formatN0,
  reasonError,
  vehicleNo,
  type DeleteAction,
} from "./subcontractLogic";

type Props = {
  /** Silinecek satır ve karar (POSTED → ters kayıt, OPEN → DELETE); null iken kapalı. */
  pending: { row: SubcontractCostRow; action: DeleteAction } | null;
  onClose: () => void;
};

/**
 * "Nakliye Giderini Sil" onayı (ZTO CompanySalesDetails.cshtml:1450-1454 tarayıcı confirm()'i;
 * ZtoConfirmModal görünümüyle). Son cümle uyarlandı: silme yerine ters kayıt (§5.7). Ters kayıtta
 * gerekçe zorunludur ve `reverse` gövdesine yazılır; OPEN gider DELETE ile silinir (Rev 1 F6).
 * Açılışta odak güvenli eyleme (İptal) ya da gerekçe alanına verilir (MWG `dialog`).
 */
export function DeleteCostModal({ pending, onClose }: Props) {
  const { t } = useTranslation("ztoFinans");
  const x = (key: string, options?: Record<string, unknown>) =>
    t(`salesTruckExpenses.delete.${key}`, options);
  const snackbar = useZtoSnackbar();
  const reverse = useReverseSubcontractCost();
  const remove = useDeleteSubcontractCost();
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const key = pending ? `${pending.row.costId}:${pending.action}` : null;
  if (key !== openFor) {
    setOpenFor(key);
    setReason("");
    setInvalid(false);
  }
  const busy = reverse.isPending || remove.isPending;

  async function confirm() {
    if (!pending || busy) return;
    const { row, action } = pending;
    if (reasonError(action, reason)) {
      setInvalid(true);
      document.getElementById("deleteReason")?.focus();
      return;
    }
    try {
      if (action === "reverse") {
        await reverse.mutateAsync({
          costId: String(row.costId),
          body: { date: localToday(), reason: reason.trim() },
        });
      } else {
        await remove.mutateAsync(String(row.costId));
      }
      snackbar.show(x("done"), "success");
    } catch (failure) {
      snackbar.show(
        x("failed", { message: failure instanceof Error ? failure.message : String(failure) }),
        "error",
      );
    }
    onClose();
  }

  const row = pending?.row;
  return (
    <ZtoModal
      show={pending !== null}
      onHide={() => {
        if (!busy) onClose();
      }}
      id="deleteSalesExpense"
      backdrop={busy ? "static" : true}
      keyboard={!busy}
      headerClassName="bg-danger text-white"
      closeButtonClassName="text-white"
      closeDisabled={busy}
      onEntered={() =>
        document
          .getElementById(pending?.action === "reverse" ? "deleteReason" : "deleteCancelButton")
          ?.focus()
      }
      title={
        <>
          <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {x("title")}
        </>
      }
      footer={
        <>
          <button
            type="button"
            id="deleteCancelButton"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            <i className="fas fa-times" aria-hidden="true" /> {x("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void confirm()}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? (
              <>
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                />{" "}
                {x("busy")}
              </>
            ) : (
              <>
                <i className="fas fa-trash" aria-hidden="true" /> {x("confirm")}
              </>
            )}
          </button>
        </>
      }
    >
      {row && pending && (
        <>
          <p>{x("question")}</p>
          <p>
            {x("vehicle")}: {vehicleNo(row)}
            {row.vehiclePlate ? ` · ${row.vehiclePlate}` : ""}
            <br />
            {x("transportMode")}: {t(`salesTruckExpenses.transportMode.${row.transportMode}`)}
            {row.money ? ` · ${formatN0(row.money.amount, row.money.currency)}` : ""}
          </p>
          <p className="text-muted">
            <small>{pending.action === "delete" ? x("noteOpen") : x("note")}</small>
          </p>
          {pending.action === "reverse" && (
            <div className="form-group mb-0">
              <label htmlFor="deleteReason" className="small font-weight-bold">
                {x("reason")} <span className="text-danger">*</span>
              </label>
              <textarea
                id="deleteReason"
                className={invalid ? "form-control is-invalid" : "form-control"}
                rows={2}
                required
                maxLength={REASON_MAX}
                placeholder={x("reasonPlaceholder")}
                value={reason}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? "deleteReasonError" : undefined}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (invalid) setInvalid(false);
                }}
              />
              {invalid && (
                <div id="deleteReasonError" className="invalid-feedback d-block">
                  {x("reasonRequired")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </ZtoModal>
  );
}
